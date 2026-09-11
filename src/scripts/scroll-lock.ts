// Shared, reference-counted scroll lock.
//
// Two independent features lock scrolling: the intro wipe in Base.astro and
// the mobile menu in SiteNav.astro. Both previously wrote
// `document.body.style.overflow` directly, which made them fight:
//
//   - Open the menu during the 4.3s intro and it captured prevOverflow
//     'hidden', then restored 'hidden' on close — page stuck locked.
//   - Or the intro's timer fired while the menu was open and cleared the
//     menu's lock, letting the page scroll under the overlay.
//
// A counter fixes both: the lock lifts only once every holder has released.
// The lock is a CLASS on <html>, not an inline style, so it is declarative,
// inspectable, and cannot be clobbered by whichever feature writes last.

const CLASS = 'scroll-locked';
const holders = new Set<string>();

function apply(): void {
  document.documentElement.classList.toggle(CLASS, holders.size > 0);
}

/** Acquire the lock for `owner`. Idempotent per owner. */
export function lockScroll(owner: string): void {
  holders.add(owner);
  apply();
}

/** Release `owner`'s hold. Scrolling resumes once no owner remains. */
export function unlockScroll(owner: string): void {
  holders.delete(owner);
  apply();
}

/** Escape hatch: drop every hold. Used by the intro's safety net. */
export function forceUnlockAll(): void {
  holders.clear();
  apply();
}
