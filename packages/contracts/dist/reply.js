import { createFileReply } from "./adapters/node-fs/file-reply.js";
import { empty, html, json, redirect, stream, text } from "./core/http/reply-builders.js";
export const Reply = Object.freeze({ json, text, html, stream, file: createFileReply, empty, redirect });
