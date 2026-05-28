export const SEED_USER_ID = '11111111-1111-4111-8111-111111111111';
export const SEED_MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
export const SEED_WALLET_ID = '33333333-3333-4333-8333-333333333333';

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function buildRampStages(targetVUs, scaleSteps, stepDuration, cooldownDuration) {
  const stages = [];
  const step = Math.ceil(targetVUs / scaleSteps);
  for (let i = 1; i <= scaleSteps; i++) {
    stages.push({ duration: stepDuration, target: step * i });
  }
  stages.push({ duration: cooldownDuration, target: 0 });
  return stages;
}
