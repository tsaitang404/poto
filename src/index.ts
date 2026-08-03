import {
  handleGetAccessPassword,
  handleGetApiToken,
  handleLogout,
  handleProtectedPost,
  handleRotateApiToken,
  handleUpdateAccessPassword,
} from "./handlers/auth";
import {
  handleDeleteImage,
  handleGetImage,
  handleListImages,
  handleServeFile,
  handleUpdateImage,
  handleUpload,
  handleViewPage,
} from "./handlers/media";
import {
  handleGetAiMeta,
  handleReanalyze,
  handleUpdateAiMeta,
  scheduleAiAnalysis,
} from "./handlers/ai";
import { handleGetSettings, handleUpdateSettings } from "./handlers/settings";
import { handleGetStats } from "./handlers/stats";
import { isAuthed, isUploadAuthed } from "./lib/auth";
import { htmlResponse, json } from "./lib/http";
import { getWorkerBaseUrl } from "./lib/upload";
import { renderManagePage } from "./pages/manage-page";
import { renderUploadPage } from "./pages/upload-page";
import { renderProtectedPage } from "./pages/simple-pages";
import type { Env } from "./types";
import type { ExecutionContext } from "@cloudflare/workers-types";

function getImageId(pathname: string): string {
  return pathname.split("/").pop() ?? "";
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const authed = await isAuthed(request, env);
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

    if (url.pathname === "/logout" && request.method === "POST") {
      return handleLogout(url.origin);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      const allowed = await isUploadAuthed(request, env);
      const res = await handleUpload(request, env, workerBaseUrl, allowed);
      // 上传成功后异步触发 AI 分析（仅生产环境有 ctx 时；测试无 ctx 跳过）
      if ((res.status === 200 || res.status === 201) && ctx) {
        try {
          const body = await res.clone().json();
          if (body?.id) {
            scheduleAiAnalysis({ waitUntil: (p) => ctx.waitUntil(p) }, env, body.id);
          }
        } catch {
          // 忽略解析失败（响应已返回）
        }
      }
      return res;
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

    if (url.pathname === "/api/password" && request.method === "GET") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetAccessPassword(env);
    }

    if (url.pathname === "/api/password" && request.method === "PUT") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleUpdateAccessPassword(request, env);
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

    if (url.pathname === "/api/stats" && request.method === "GET") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetStats(env);
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

    // AI 元数据：GET /api/images/:id/ai
    if (url.pathname.match(/^\/api\/images\/[^/]+\/ai$/) && request.method === "GET") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetAiMeta(env, getImageId(url.pathname));
    }

    // AI 元数据编辑：PUT /api/images/:id/ai
    if (url.pathname.match(/^\/api\/images\/[^/]+\/ai$/) && request.method === "PUT") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleUpdateAiMeta(env, getImageId(url.pathname), await request.json().catch(() => ({})));
    }

    // AI 重新分析：POST /api/images/:id/ai
    if (url.pathname.match(/^\/api\/images\/[^/]+\/ai$/) && request.method === "POST") {
      if (!authed) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleReanalyze(env, getImageId(url.pathname), { waitUntil: (p) => ctx.waitUntil(p) });
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
