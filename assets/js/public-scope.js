// R5.1 temporary public suppression.
// This is a display/public-projection rule, not permanent publication governance.
//
// Current temporary rule:
//   1) hide water systems with blank latitude OR longitude
//   2) hide villages marked as having village waterworks but with no linked
//      water system in the ORIGINAL API dataset
//
// IMPORTANT: rule (2) is evaluated before rule (1). This prevents a village
// whose only linked system lacks coordinates from becoming an additional
// no-system suppression and preserves the audited 133 + 111 = 244 semantics.

export function buildTemporaryPublicScope(payload = {}) {
  const villages = Array.isArray(payload.villages) ? payload.villages : [];
  const waterSystems = Array.isArray(payload.waterSystems) ? payload.waterSystems : [];
  const waterSources = Array.isArray(payload.waterSources) ? payload.waterSources : [];

  const originalLinkedVillageIds = new Set(
    waterSystems
      .map(system => system?.village_id)
      .filter(value => !isBlank(value))
      .map(value => String(value).trim())
  );

  const hiddenVillageIds = new Set(
    villages
      .filter(village => (
        isWaterworksVillage(village) &&
        !originalLinkedVillageIds.has(String(village?.village_id ?? '').trim())
      ))
      .map(village => String(village.village_id).trim())
  );

  const hiddenMissingCoordinateSystems = waterSystems.filter(system => !isCoordinatePresent(system));

  const publicVillages = villages.filter(
    village => !hiddenVillageIds.has(String(village?.village_id ?? '').trim())
  );

  const publicVillageIds = new Set(
    publicVillages
      .map(village => village?.village_id)
      .filter(value => !isBlank(value))
      .map(value => String(value).trim())
  );

  const publicWaterSystems = waterSystems.filter(system => (
    isCoordinatePresent(system) &&
    publicVillageIds.has(String(system?.village_id ?? '').trim())
  ));

  const publicWaterSources = waterSources.filter(source => (
    publicVillageIds.has(String(source?.village_id ?? '').trim())
  ));

  return {
    villages: publicVillages,
    waterSystems: publicWaterSystems,
    waterSources: publicWaterSources,
    suppression: {
      rule: 'R5_1_TEMP_HIDE_244',
      hiddenMissingCoordinateSystems: hiddenMissingCoordinateSystems.length,
      hiddenWaterworksVillagesWithoutSystem: hiddenVillageIds.size,
      hiddenIssueRows: hiddenMissingCoordinateSystems.length + hiddenVillageIds.size,
      inputVillages: villages.length,
      inputWaterSystems: waterSystems.length,
      outputVillages: publicVillages.length,
      outputWaterSystems: publicWaterSystems.length
    }
  };
}

export function isCoordinatePresent(system) {
  return !isBlank(system?.latitude) && !isBlank(system?.longitude);
}

export function isWaterworksVillage(village) {
  return village?.has_village_waterworks === true ||
    village?.has_village_waterworks === 1 ||
    village?.has_village_waterworks === '1' ||
    String(village?.has_village_waterworks ?? '').trim().toUpperCase() === 'YES' ||
    String(village?.has_village_waterworks ?? '').trim() === 'มีประปาหมู่บ้าน';
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}
