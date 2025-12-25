import copy from '@phosphor-icons/core/assets/regular/copy.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import x from '@phosphor-icons/core/assets/regular/x.svg?raw';
import circle from '@phosphor-icons/core/assets/regular/circle.svg?raw';
import clock from '@phosphor-icons/core/assets/regular/clock.svg?raw';
import code from '@phosphor-icons/core/assets/regular/code.svg?raw';
import arrowsClockwise from '@phosphor-icons/core/assets/regular/arrows-clockwise.svg?raw';
import arrowsInLineVertical from '@phosphor-icons/core/assets/regular/arrows-in-line-vertical.svg?raw';
import arrowsOutLineVertical from '@phosphor-icons/core/assets/regular/arrows-out-line-vertical.svg?raw';
import list from '@phosphor-icons/core/assets/regular/list.svg?raw';
import clipboard from '@phosphor-icons/core/assets/regular/clipboard.svg?raw';
import sidebarSimple from '@phosphor-icons/core/assets/regular/sidebar-simple.svg?raw';

export const icons = {
	copy,
	check,
	x,
	circle,
	clock,
	code,
	refresh: arrowsClockwise,
	fold: arrowsInLineVertical,
	unfold: arrowsOutLineVertical,
	list,
	clipboard,
	sidebar: sidebarSimple,
} as const;

export type IconName = keyof typeof icons;
