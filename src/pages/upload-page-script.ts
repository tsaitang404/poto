import { uploadPageScriptCore } from "./upload-page-script-core";
import { uploadPageScriptDnd } from "./upload-page-script-dnd";
import { uploadPageScriptCodec } from "./upload-page-script-codec";
import { uploadPageScriptPolicy } from "./upload-page-script-policy";

export const uploadPageScript = [
  uploadPageScriptCore,
  uploadPageScriptDnd,
  uploadPageScriptCodec,
  uploadPageScriptPolicy
].join("\n");
