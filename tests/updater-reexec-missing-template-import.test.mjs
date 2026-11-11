/**
 * tests/updater-reexec-missing-template-import.test.mjs — the target updater
 * survives a scripts/cv-templates.mjs whose local imports were not checked out yet.
 *
 * The self-reexec checkout list is built by the CLIENT updater. #4999 taught
 * resolveReexecCheckout() to walk the fallback files' own imports, but an
 * install whose updater predates that fix still checks out the new
 * scripts/cv-templates.mjs without the modules it newly imports. The target updater then
 * reaches `await import('./cv-templates.mjs')` in
 * loadConfiguredTemplateVariants() against a tree that lacks them, which is the
 * ERR_MODULE_NOT_FOUND crash #4999 reported. Only the target's own code can
 * cover that transition.
 */
import { copyFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, rmSync, ROOT } from './helpers.mjs';

console.log('\n🧪 Testing the target updater against an old client\'s short re-exec checkout...');

const root = mkdtempSync(join(tmpdir(), 'reexec-target-'));
try {
  copyFileSync(join(ROOT, 'scripts/update-system.mjs'), (mkdirSync(join(root, 'scripts'), { recursive: true }), join(root, 'scripts/update-system.mjs')));
  writeFileSync((mkdirSync(join(root, 'scripts'), { recursive: true }), join(root, 'scripts/cv-templates.mjs')),
    "import { parseMeta } from './lib/not-checked-out-yet.mjs';\nexport { parseMeta };\n");
  const profilePath = join(root, 'profile.yml');
  writeFileSync(profilePath, 'cv:\n  template: bw\ncover_letter:\n  template: concise\n');

  const target = await import(pathToFileURL(join(root, 'scripts/update-system.mjs')).href);
  let configured;
  try {
    configured = await target.loadConfiguredTemplateVariants({ profilePath });
  } catch (err) {
    configured = err;
  }
  if (configured?.cv === 'bw' && configured?.cover === 'concise') {
    pass('target updater reads configured variants when a scripts/cv-templates.mjs import is missing');
  } else {
    fail(`target updater did not fall back past a missing scripts/cv-templates.mjs import: ${configured?.message || JSON.stringify(configured)}`);
  }

  let noProfile;
  try {
    noProfile = await target.loadConfiguredTemplateVariants({ profilePath: join(root, 'absent.yml') });
  } catch (err) {
    noProfile = err;
  }
  if (noProfile && !(noProfile instanceof Error) && Object.keys(noProfile).length === 0) {
    pass('target updater returns no variants when the profile is absent too');
  } else {
    fail(`target updater mishandled a missing import with no profile: ${noProfile?.message || JSON.stringify(noProfile)}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
