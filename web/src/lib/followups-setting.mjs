// follow_ups.enabled in config/profile.yml, read the same way the core
// scripts/followup-cadence.mjs reads it: only an explicit false turns follow-ups off.
export function followupsEnabledFromProfile(profile) {
  return profile?.follow_ups?.enabled !== false;
}
