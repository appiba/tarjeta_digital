function ensureDriveFolders_() {
  var properties = PropertiesService.getScriptProperties();
  var rootFolder = getExistingFolder_(properties.getProperty('DRIVE_FOLDER_ID'));

  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('LOYALTY_APP');
    properties.setProperty('DRIVE_FOLDER_ID', rootFolder.getId());
  }

  var logosFolder = ensureChildFolder_(rootFolder, 'logos');
  var promotionsFolder = ensureChildFolder_(rootFolder, 'promotions');

  properties.setProperty('LOGOS_FOLDER_ID', logosFolder.getId());
  properties.setProperty('PROMOTIONS_FOLDER_ID', promotionsFolder.getId());

  return {
    rootFolderId: rootFolder.getId(),
    logosFolderId: logosFolder.getId(),
    promotionsFolderId: promotionsFolder.getId()
  };
}

function getExistingFolder_(folderId) {
  if (!folderId) {
    return null;
  }

  try {
    return DriveApp.getFolderById(folderId);
  } catch (error) {
    return null;
  }
}

function ensureChildFolder_(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(name);
}
