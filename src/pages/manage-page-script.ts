import { managePageScriptSettings } from "./manage-page-script-settings";
import { managePageScriptList } from "./manage-page-script-list";
import { managePageScriptUtils } from "./manage-page-script-utils";

export const managePageScript = [
  managePageScriptSettings,
  managePageScriptList,
  managePageScriptUtils
].join("\n");
