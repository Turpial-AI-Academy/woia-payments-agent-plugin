import { createHash } from 'node:crypto';

export const actions = Object.freeze(['payment.observe','payment.accept','payment.reconcile','payment.reserve','payment.execute','payment.status.observe','payment.effect.reconcile','payment.release-reservation']);
const fail = (condition, code) => { if (!condition) throw new Error(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function minor(value) { fail(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value),'EXACT_MINOR_UNITS_REQUIRED'); return BigInt(value); }
function money(value) { fail(value && text(value.currency) && Number.isInteger(value.scale) && value.scale >= 0 && value.scale <= 18,'CURRENCY_SCALE_REQUIRED'); minor(value.minor); }
const key = (...values) => JSON.stringify(values);
export function initialState(org) { fail(text(org),'ORG_REQUIRED'); return {schema:'dev.woia.payments-state/v1',org,revision:0,observations:{},payments:{},reservations:{},effects:{},operations:{},reconciliation:[]}; }
function scope(record, command) { for(const k of ['currency','scale','beneficiary','custody','purpose','account']) fail(record[k] === command[k],`SCOPE_MISMATCH_${k}`); }
function guard(state, command, context) {
  fail(actions.includes(command.action),'UNKNOWN_ACTION'); fail(state.org === command.org && context.org === state.org,'ORG_ISOLATION');
  fail(context.authenticated === true && text(context.actor) && text(context.task),'AUTHENTICATED_ACTOR_TASK_REQUIRED');
  fail(context.department === 'Finance' && context.capability === 'woia-payments' && context.admitted === true,'FINANCE_PROVIDER_SCOPE_REQUIRED');
  fail(context.emergency_stop === false && context.policy && context.policy.revoked === false,'CURRENT_POLICY_REQUIRED');
  const now = Date.parse(context.now); fail(Number.isFinite(now),'HOST_TIME_REQUIRED');
  const policy=context.policy;
  fail(text(policy.id) && text(policy.version) && text(policy.digest) && Date.parse(policy.from) <= now && now < Date.parse(policy.until),'POLICY_EXPIRED');
  const grant=context.grant;
  fail(grant && text(grant.id) && text(grant.revision) && text(grant.issuer),'GRANT_PROVENANCE_REQUIRED');
  fail(grant && grant.actor === context.actor && grant.task === context.task && grant.org === state.org && grant.operation === command.action && grant.target === command.target && grant.policy_digest === policy.digest && grant.revoked === false && grant.issuer !== context.actor && Date.parse(grant.from) <= now && now < Date.parse(grant.until),'EXACT_GRANT_REQUIRED');
  fail(command.expected_revision === state.revision,'STALE_REVISION');
}
function sourceRule(command, context, observation) {
  const rule=context.source_rule; const now=Date.parse(context.now);
  fail(rule && rule.org === command.org && rule.account === command.account && rule.namespace === observation.namespace && rule.version === command.source_map_version && rule.conflict === false && rule.writer === 'woia-payments' && rule.revoked === false && rule.fresh === true && Date.parse(rule.from) <= now && now < Date.parse(rule.until),'SOURCE_AUTHORITY_REQUIRED');
  fail(observation.fresh === true && observation.conflict === false && observation.account === command.account && observation.source_verified === true,'OBSERVATION_UNCONFIRMED');
  return rule;
}
function approval(command, context) {
  const a=context.approval, now=Date.parse(context.now);
  fail(a && text(a.id) && text(a.revision) && a.org === command.org && a.operation === command.action && a.target === command.target && a.actor === context.actor && a.task === context.task && a.approver !== context.actor && a.competent === true && a.revoked === false && a.policy_digest === context.policy.digest && a.payload_digest === digest(command.payload) && Date.parse(a.from) <= now && now < Date.parse(a.until),'EXACT_APPROVAL_REQUIRED');
}
function available(state, payment) {
  let amount=minor(payment.minor);
  for(const r of Object.values(state.reservations)) if(r.payment_id===payment.id) amount-=minor(r.consumed)+minor(r.remaining);
  return amount;
}
function acceptedFundsStillUsable(state, paymentId) {
  const latest=state.reconciliation.filter(r=>r.kind==='PaymentReconciliation' && r.payment_id===paymentId).at(-1);
  fail(!latest || latest.status==='CONFIRMED','PAYMENT_RECONCILIATION_BLOCKS_FUNDS');
}
/** Pure immutable CAS transition. Context comes from an authenticated, current host resolver, never model input. */
export function transition(original, command, context) {
  guard(original,command,context);
  const reads=['payment.status.observe'];
  if(reads.includes(command.action)) { const effect=original.effects[command.target]; fail(effect,'EFFECT_NOT_FOUND'); return {state:structuredClone(original),result:structuredClone(effect),dispatch:null}; }
  fail(text(command.operation_key),'OPERATION_KEY_REQUIRED');
  const fingerprint=digest({...command,expected_revision:undefined});
  if(original.operations[command.operation_key]) { const old=original.operations[command.operation_key]; fail(old.digest===fingerprint,'OPERATION_KEY_CONFLICT'); return {state:structuredClone(original),result:structuredClone(old.result),dispatch:null}; }
  const state=structuredClone(original), p=command.payload; fail(p && typeof p==='object','PAYLOAD_REQUIRED');
  let result, dispatch=null;
  if(command.action==='payment.observe') {
    fail(text(p.id) && text(p.namespace) && text(p.source_id) && text(p.source_version) && text(p.account) && text(p.evidence) && text(p.occurred_at),'SOURCE_PROVENANCE_REQUIRED');
    money(p); fail(p.id===command.target,'TARGET_MISMATCH');
    fail(context.source_verification && context.source_verification.payload_digest===digest(p),'SOURCE_VERIFICATION_BINDING_REQUIRED');
    fail(!state.observations[p.id],'OBSERVATION_IMMUTABLE');
    result={...structuredClone(p),kind:'PaymentObservation',org:state.org,recorded_at:context.now,source_verified:context.source_verification.verified===true,fresh:context.source_verification.fresh===true,conflict:context.source_verification.conflict!==false};state.observations[p.id]=result;
  } else if(command.action==='payment.accept') {
    const observed=state.observations[p.observation_id];fail(observed,'OBSERVATION_NOT_FOUND');money(p);fail(p.minor===observed.minor && p.currency===observed.currency && p.scale===observed.scale,'OBSERVED_MONEY_MISMATCH');
    const rule=sourceRule({...command,account:p.account,source_map_version:p.source_map_version},context,observed);
    fail(context.acceptance_confirmation && context.acceptance_confirmation.payload_digest===digest(p) && context.acceptance_confirmation.observation_id===observed.id && context.acceptance_confirmation.mode===p.confirmation_mode,'ACCEPTANCE_CONFIRMATION_BINDING_REQUIRED');
    for(const k of ['payer','beneficiary','custody','purpose','direction']) if(observed[k]!==undefined)fail(observed[k]===p[k],`OBSERVED_SCOPE_MISMATCH_${k}`);
    fail(['PROVIDER_CONFIRMED','COMPETENT_HUMAN_CONFIRMED','DIRECT_TO_BENEFICIARY_CONFIRMED'].includes(p.confirmation_mode) && rule.modes.includes(p.confirmation_mode),'CONFIRMATION_MODE_FORBIDDEN');
    fail(text(p.payer) && text(p.beneficiary) && text(p.custody) && text(p.purpose) && ['INBOUND','OUTBOUND'].includes(p.direction),'PAYMENT_SCOPE_REQUIRED');
    fail(observed.status==='CONFIRMED' && observed.reversed!==true,'OBSERVATION_UNCONFIRMED');
    if(p.confirmation_mode==='COMPETENT_HUMAN_CONFIRMED')fail(context.confirmation && context.confirmation.competent===true && rule.human_confirmers.includes(context.confirmation.actor) && context.confirmation.evidence===observed.evidence,'HUMAN_CONFIRMATION_REQUIRED');
    if(p.confirmation_mode==='DIRECT_TO_BENEFICIARY_CONFIRMED')fail(p.custody==='DIRECT_TO_BENEFICIARY','NO_FICTITIOUS_CUSTODY');
    const sourceKey=key(observed.namespace,observed.account,observed.source_id);
    fail(!Object.values(state.payments).some(payment=>payment.source_key===sourceKey),'DUPLICATE_SOURCE_FACT');fail(!state.payments[command.target],'PAYMENT_IMMUTABLE');
    result={...structuredClone(p),id:command.target,kind:'Payment',org:state.org,source_key:sourceKey,accepted_at:context.now,source_map_version:rule.version};state.payments[result.id]=result;
  } else if(command.action==='payment.reserve') {
    const payment=state.payments[p.payment_id];fail(payment,'ACCEPTED_PAYMENT_REQUIRED');money(p);scope(payment,p);
    acceptedFundsStillUsable(state,payment.id);
    fail(payment.direction==='INBOUND' && payment.custody!=='DIRECT_TO_BENEFICIARY','NO_ELIGIBLE_CUSTODIED_FUNDS');
    fail(p.hold===false && context.funds && context.funds.payment_id===payment.id && context.funds.revision===p.funds_revision && context.funds.hold===false && context.funds.purpose_allowed===true && context.funds.fresh===true,'FUNDS_ELIGIBILITY_REQUIRED');
    fail(minor(p.minor)>0n && minor(p.minor)<=available(state,payment),'INSUFFICIENT_UNRESERVED_FUNDS');fail(!state.reservations[command.target],'RESERVATION_EXISTS');
    result={...structuredClone(p),id:command.target,org:state.org,remaining:p.minor,consumed:'0',status:'RESERVED'};state.reservations[result.id]=result;
  } else if(command.action==='payment.execute') {
    approval(command,context);const r=state.reservations[p.reservation_id];fail(r,'RESERVATION_REQUIRED');money(p);scope(r,p);
    acceptedFundsStillUsable(state,r.payment_id);
    fail(r.status==='RESERVED' && !Object.values(state.effects).some(e=>e.reservation_id===r.id),'RECONCILE_BEFORE_RETRY');
    fail(minor(p.minor)===minor(r.remaining) && p.fee_minor!==undefined,'EXACT_RESERVATION_REQUIRED');minor(p.fee_minor);
    fail(minor(p.fee_minor)<=minor(p.minor),'FEE_EXCEEDS_RESERVED_DEBIT');
    fail(context.aggregate && context.aggregate.current===true && context.aggregate.account===p.account && context.aggregate.currency===p.currency && context.aggregate.scale===p.scale && minor(p.minor)<=minor(context.aggregate.remaining_minor),'AGGREGATE_LIMIT_REQUIRED');
    fail(text(p.account) && text(p.provider_operation) && context.adapter && context.adapter.configured===true && context.adapter.qualified===true && context.adapter.account===p.account && context.adapter.notifications_suppressed===true,'ADAPTER_CONFIGURATION_QUALIFICATION_REQUIRED');
    fail(context.funds && context.funds.payment_id===r.payment_id && context.funds.fresh===true && context.funds.hold===false && context.funds.purpose_allowed===true && context.funds.revision===p.funds_revision,'CURRENT_FUNDS_ELIGIBILITY_REQUIRED');
    fail(!state.effects[command.target] && !Object.values(state.effects).some(e=>e.provider_operation===p.provider_operation),'EFFECT_ID_CONFLICT');
    result={...structuredClone(p),id:command.target,org:state.org,status:'UNKNOWN',confirmed_minor:'0',approval_ref:context.approval.id,payload_digest:digest(p)};state.effects[result.id]=result;r.status='UNKNOWN';
    dispatch={effect_id:result.id,provider_operation:p.provider_operation,payload:structuredClone(p),persist_before_dispatch:true};
  } else if(command.action==='payment.effect.reconcile') {
    const effect=state.effects[command.target];fail(effect,'EFFECT_NOT_FOUND');
    fail(context.receipt && context.receipt.verified===true && context.receipt.org===state.org && context.receipt.provider_operation===effect.provider_operation && context.receipt.effect_id===effect.id && text(context.receipt.evidence),'VERIFIED_SAME_EFFECT_RECEIPT_REQUIRED');
    const receipt=context.receipt;fail(['UNKNOWN','PARTIAL','SUCCEEDED','FAILED'].includes(receipt.status),'UNSUPPORTED_OUTCOME');minor(receipt.confirmed_minor);
    const r=state.reservations[effect.reservation_id], total=minor(effect.minor), confirmed=minor(receipt.confirmed_minor);
    fail(confirmed>=minor(effect.confirmed_minor) && confirmed<=total,'INVALID_CONFIRMED_AMOUNT');
    fail(receipt.currency===effect.currency && receipt.scale===effect.scale,'RECEIPT_MONEY_SCOPE_MISMATCH');
    fail((receipt.status!=='SUCCEEDED'||confirmed===total) && (receipt.status!=='FAILED'||confirmed===0n) && (receipt.status!=='PARTIAL'||confirmed>0n&&confirmed<total),'STATUS_AMOUNT_CONFLICT');
    fail(!['SUCCEEDED','FAILED'].includes(effect.status)||receipt.status===effect.status&&confirmed===minor(effect.confirmed_minor),'TERMINAL_OUTCOME_IMMUTABLE');
    const delta=confirmed-minor(effect.confirmed_minor);r.remaining=(minor(r.remaining)-delta).toString();r.consumed=(minor(r.consumed)+delta).toString();effect.confirmed_minor=confirmed.toString();effect.status=receipt.status;effect.evidence=receipt.evidence;r.status=receipt.status==='FAILED'?'FAILED':receipt.status;
    state.reconciliation.push({...structuredClone(receipt),kind:'EffectReconciliation',effect_id:effect.id});result=effect;
  } else if(command.action==='payment.release-reservation') {
    const r=state.reservations[command.target];fail(r,'RESERVATION_NOT_FOUND');const effects=Object.values(state.effects).filter(e=>e.reservation_id===r.id);
    fail(!effects.some(e=>['UNKNOWN','PARTIAL'].includes(e.status)),'RECONCILE_BEFORE_RELEASE');fail(r.status!=='SUCCEEDED','CONSUMED_RESERVATION');approval(command,context);r.remaining='0';r.status='RELEASED';result=r;
  } else if(command.action==='payment.reconcile') {
    const payment=state.payments[command.target];fail(payment,'ACCEPTED_PAYMENT_REQUIRED');
    fail(text(p.evidence) && text(p.source_version) && ['CONFIRMED','DISPUTED','REVERSED','UNKNOWN'].includes(p.status),'RECONCILIATION_EVIDENCE_REQUIRED');
    const observation=state.observations[p.observation_id];fail(observation && observation.account===payment.account && observation.namespace===state.observations[payment.observation_id].namespace && observation.source_id===state.observations[payment.observation_id].source_id,'SAME_PAYMENT_SOURCE_REQUIRED');
    sourceRule({...command,account:payment.account,source_map_version:p.source_map_version},context,observation);
    result={...structuredClone(p),kind:'PaymentReconciliation',payment_id:payment.id,recorded_at:context.now};state.reconciliation.push(result);
  }
  state.revision++;state.operations[command.operation_key]={digest:fingerprint,result:structuredClone(result)};
  return {state,result:structuredClone(result),dispatch};
}

/** Host-owned store.transaction must atomically commit the transition/outbox before dispatch and prevent concurrent dispatch. */
export async function apply(store, command, resolveContext) {
  fail(store && typeof store.transaction==='function' && typeof resolveContext==='function','ATOMIC_STORE_AND_TRUSTED_RESOLVER_REQUIRED');
  return store.transaction(command.org, async current => transition(current,command,await resolveContext(command)));
}
