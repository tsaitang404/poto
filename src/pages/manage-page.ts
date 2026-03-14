import { escapeHtml } from "../lib/text";
import { managePageScript } from "./manage-page-script";
import { managePageTemplateStyleBase } from "./manage-page-template-style-base";
import { managePageTemplateStyleComponents } from "./manage-page-template-style-components";
import { managePageTemplateMarkup } from "./manage-page-template-markup";

const managePageTemplate = [
  managePageTemplateStyleBase,
  managePageTemplateStyleComponents,
  managePageTemplateMarkup
].join("\n");

export function renderManagePage(title: string): string {
  return managePageTemplate
    .replace("__MANAGE_TITLE__", escapeHtml(title))
    .replace("__MANAGE_SCRIPT__", managePageScript);
}
