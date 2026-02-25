let initialized = false;
const HELP_MARGIN = 8;

function positionHelp(wrapper) {
  if (!wrapper) return;
  const trigger = wrapper.querySelector('.card-help-trigger');
  const popover = wrapper.querySelector('.card-help-popover');
  if (!trigger || !popover) return;

  const triggerRect = trigger.getBoundingClientRect();
  const previousVisibility = popover.style.visibility;
  const previousOpacity = popover.style.opacity;

  // Ensure measurable size even if hidden.
  popover.style.visibility = 'hidden';
  popover.style.opacity = '0';
  popover.style.left = '0px';
  popover.style.top = '0px';

  const width = popover.offsetWidth || 320;
  const height = popover.offsetHeight || 140;

  let x = triggerRect.right - width;
  if (x < HELP_MARGIN) x = HELP_MARGIN;
  if (x + width > window.innerWidth - HELP_MARGIN) {
    x = Math.max(HELP_MARGIN, window.innerWidth - HELP_MARGIN - width);
  }

  let y = triggerRect.bottom + 8;
  if (y + height > window.innerHeight - HELP_MARGIN) {
    y = triggerRect.top - height - 8;
  }
  if (y < HELP_MARGIN) y = HELP_MARGIN;

  popover.style.left = `${Math.round(x)}px`;
  popover.style.top = `${Math.round(y)}px`;
  popover.style.visibility = previousVisibility;
  popover.style.opacity = previousOpacity;
}

function closeAllHelp() {
  document.querySelectorAll('[data-card-help][data-open="true"]').forEach((item) => {
    item.setAttribute('data-open', 'false');
    const trigger = item.querySelector('.card-help-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function setHelpOpen(wrapper, open) {
  if (!wrapper) return;
  wrapper.setAttribute('data-open', open ? 'true' : 'false');
  const trigger = wrapper.querySelector('.card-help-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function initCardHelpTooltips() {
  if (initialized) return;
  initialized = true;

  const wrappers = Array.from(document.querySelectorAll('[data-card-help]'));
  wrappers.forEach((wrapper) => {
    wrapper.addEventListener('mouseenter', () => positionHelp(wrapper));
    wrapper.addEventListener('focusin', () => positionHelp(wrapper));
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.card-help-trigger');
    if (trigger) {
      event.preventDefault();
      const wrapper = trigger.closest('[data-card-help]');
      positionHelp(wrapper);
      const isOpen = wrapper?.getAttribute('data-open') === 'true';
      closeAllHelp();
      if (!isOpen) setHelpOpen(wrapper, true);
      return;
    }

    if (!event.target.closest('[data-card-help]')) {
      closeAllHelp();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllHelp();
    }
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll('[data-card-help][data-open="true"]').forEach((wrapper) => {
      positionHelp(wrapper);
    });
  });

  window.addEventListener(
    'scroll',
    () => {
      closeAllHelp();
    },
    true
  );
}
