import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => {
	const sidebarCollapsed = cookies.get('sidebar-collapsed');

	return {
		sidebarCollapsed: sidebarCollapsed === 'true',
	};
};
