import { handleGetApiToken, handleProtectedPost, handleRotateApiToken } from "./handlers/auth";
import {
  handleDeleteImage,
  handleGetImage,
  handleListImages,
  handleServeFile,
  handleUpdateImage,
  handleUpload,
  handleViewPage,
} from "./handlers/media";
import { handleGetSettings, handleUpdateSettings } from "./handlers/settings";
import { isAuthed, isUploadAuthed } from "./lib/auth";
import { htmlResponse, json } from "./lib/http";
import { getWorkerBaseUrl } from "./lib/upload";
import { renderManagePage } from "./pages/manage-page";
import { renderUploadPage } from "./pages/upload-page";
import { renderProtectedPage } from "./pages/simple-pages";
import type { Env } from "./types";

function getImageId(pathname: string): string {
  return pathname.split("/").pop() ?? "";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const authed = isAuthed(request);
    const workerBaseUrl = getWorkerBaseUrl(request, env);

    if (request.method === "GET" && url.pathname === "/") {
      if (!authed) {
        return Response.redirect(`${url.origin}/protected`, 302);
      }
      return htmlResponse(renderUploadPage(env.SITE_TITLE ?? "Poto"));
    }

    if (request.method === "GET" && url.pathname === "/manage") {
      if (!authed) {
        return Response.redirect(`${url.origin}/protected`, 302);
      }
      return htmlResponse(renderManagePage(env.SITE_TITLE ?? "Poto"));
    }

    if (url.pathname === "/protected" && request.method === "GET") {
      return htmlResponse(renderProtectedPage());
    }

    if (url.pathname === "/protected" && request.method === "POST") {
      return handleProtectedPost(request, env, url.origin);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env, workerBaseUrl, await isUploadAuthed(request, env));
    }

    if (url.pathname === "/api/token" && request.method === "GET") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetApiToken(env);
    }

    if (url.pathname === "/api/token/rotate" && request.method === "POST") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleRotateApiToken(env);
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetSettings(env);
    }

    if (url.pathname === "/api/settings" && request.method === "PUT") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleUpdateSettings(request, env);
    }

    if (url.pathname === "/api/images" && request.method === "GET") {
      return handleListImages(request, env);
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      return handleGetImage(env, getImageId(url.pathname));
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "DELETE") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleDeleteImage(env, getImageId(url.pathname));
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "PUT") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleUpdateImage(request, env, getImageId(url.pathname));
    }

    if (url.pathname.startsWith("/i/") && request.method === "GET") {
      return handleViewPage(env, getImageId(url.pathname));
    }

    if (url.pathname.startsWith("/files/") && request.method === "GET") {
      return handleServeFile(env, decodeURIComponent(url.pathname.slice("/files/".length)));
    }

    return json({ error: "not_found" }, 404);
  },
};
