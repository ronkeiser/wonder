import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface Project {
	id: string;
	workspaceId: string;
	name: string;
	description: string | null;
	settings: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch, params }) => {
	const res = await fetch(`/api/projects/${params.id}`);

	if (!res.ok) {
		error(res.status, 'Project not found');
	}

	const data = await res.json();
	return { project: data.project as Project };
};
