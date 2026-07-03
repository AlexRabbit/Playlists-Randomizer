import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { t } from '@/i18n';

import { isE2E } from '@/e2e/flags';

type TourSide = 'top' | 'right' | 'bottom' | 'left';

const HOW_TO_HINT_KEY = 'prr-how-to-hint-seen';
export const HOW_TO_USE_PULSE_CLASS = 'btn-how-to-use-pulse';

export function shouldShowHowToUsePulse(): boolean {
  if (isE2E()) return false;
  try {
    return localStorage.getItem(HOW_TO_HINT_KEY) !== '1';
  } catch {
    return false;
  }
}

export function dismissHowToUsePulse(): void {
  try {
    localStorage.setItem(HOW_TO_HINT_KEY, '1');
  } catch {
    /* private browsing */
  }
}

function isMobileTour(): boolean {
  return window.matchMedia('(max-width: 900px)').matches;
}

/** Flip side on narrow viewports so popovers stay on-screen. */
function tourSide(side: TourSide): TourSide {
  if (!isMobileTour()) return side;
  if (side === 'left' || side === 'right') return 'bottom';
  return side;
}

function tourAlign(align: 'start' | 'center' | 'end'): 'start' | 'center' | 'end' {
  return isMobileTour() ? 'center' : align;
}

function tourStep(
  selector: string | undefined,
  titleKey: Parameters<typeof t>[0],
  descKey: Parameters<typeof t>[0],
  side: TourSide = 'bottom',
  align: 'start' | 'center' | 'end' = 'start'
): DriveStep | null {
  if (selector && !document.querySelector(selector)) return null;
  return {
    element: selector,
    popover: {
      title: t(titleKey),
      description: t(descKey),
      side: tourSide(side),
      align: tourAlign(align),
    },
  };
}

function modalStep(
  titleKey: Parameters<typeof t>[0],
  descKey: Parameters<typeof t>[0]
): DriveStep {
  return {
    popover: {
      title: t(titleKey),
      description: t(descKey),
      side: tourSide('bottom'),
      align: 'center',
    },
  };
}

function buildTourSteps(): DriveStep[] {
  const steps: (DriveStep | null)[] = [
    modalStep('tourConceptTitle', 'tourConceptDesc'),
    tourStep('#tour-sidebar', 'tourSidebarTitle', 'tourSidebarDesc', 'left'),
    tourStep('#tour-add-list', 'tourAddListTitle', 'tourAddListDesc', 'left'),
    tourStep('#tour-list-nav', 'tourListNavTitle', 'tourListNavDesc', 'left'),
    tourStep('#tour-list-actions', 'tourListActionsTitle', 'tourListActionsDesc', 'bottom'),
    tourStep('#tour-cards-grid', 'tourCardsTitle', 'tourCardsDesc', 'top'),
    tourStep('#tour-no-cards', 'tourNoCardsTitle', 'tourNoCardsDesc', 'top'),
    tourStep('#tour-first-card', 'tourCardTitle', 'tourCardDesc', 'top'),
    tourStep('#tour-first-card-controls', 'tourCardControlsTitle', 'tourCardControlsDesc', 'top'),
    tourStep('#tour-first-card-toggles', 'tourCardTogglesTitle', 'tourCardTogglesDesc', 'top'),
    tourStep('#tour-queue-btn', 'tourQueueTitle', 'tourQueueDesc', 'top'),
    tourStep('#tour-first-card-menu', 'tourCardMenuTitle', 'tourCardMenuDesc', 'left'),
    tourStep('#tour-settings', 'tourSettingsTitle', 'tourSettingsDesc', 'left'),
    tourStep('#tour-sidebar-footer', 'tourFooterTitle', 'tourFooterDesc', 'left'),
    tourStep('#tour-topbar-actions', 'tourTopbarTitle', 'tourTopbarDesc', 'bottom', 'end'),
    tourStep('#tour-list-nav', 'tourGlobalPlayerTitle', 'tourGlobalPlayerDesc', 'left'),
    modalStep('tourVideoTitle', 'tourVideoDesc'),
  ];

  return steps.filter((s): s is DriveStep => s !== null);
}

let activeDriver: ReturnType<typeof driver> | null = null;

export function isTourActive(): boolean {
  return activeDriver?.getState()?.isInitialized === true;
}

export function startHowToUseTour(): void {
  if (isTourActive()) return;

  const steps = buildTourSteps();
  if (!steps.length) return;

  const mobile = isMobileTour();

  activeDriver = driver({
    showProgress: true,
    progressText: t('tourProgress'),
    nextBtnText: t('tourNext'),
    prevBtnText: t('tourPrev'),
    doneBtnText: t('tourDone'),
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.72,
    stagePadding: mobile ? 4 : 8,
    stageRadius: mobile ? 8 : 10,
    popoverOffset: mobile ? 12 : 10,
    popoverClass: `prr-tour-popover${mobile ? ' prr-tour-popover-mobile' : ''}`,
    steps,
    onDestroyed: () => {
      activeDriver = null;
    },
  });

  activeDriver.drive();
}
