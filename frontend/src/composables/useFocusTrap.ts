import { onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab / Shift+Tab inside `container` while `isOpen()` is true (for modal dialogs and drawers),
 * so keyboard users can't wander into the page hidden behind the backdrop.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>, isOpen: () => boolean) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !isOpen() || !container.value) return;
    const items = [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) {
      e.preventDefault();
      container.value.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && container.value.contains(active);
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };
  onMounted(() => document.addEventListener('keydown', onKey, true));
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true));
}
