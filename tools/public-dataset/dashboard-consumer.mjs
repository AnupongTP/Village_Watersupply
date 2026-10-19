import { buildTemporaryPublicScope } from '../../assets/js/public-scope.js';

// Browser-compatible demonstration only; the deployed Dashboard is unchanged.
export function consumeLocalDashboardResponse(response) {
  if (!response || response.success !== true ||
      !['villages', 'waterSystems', 'waterSources'].every(key => Array.isArray(response[key]))) {
    throw new Error('Invalid public Dashboard response');
  }
  if (response.projectionOwner === 'SERVER_R5_1') {
    return {
      villages: response.villages,
      waterSystems: response.waterSystems,
      waterSources: response.waterSources
    };
  }
  if (response.projectionOwner !== undefined) throw new Error('Unknown projection owner');
  return buildTemporaryPublicScope(response);
}
