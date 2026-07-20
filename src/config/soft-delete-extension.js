// src/config/soft-delete-extension.js
//
// Auto-scopes every read on soft-deletable models (User, Event) to
// non-deleted rows, so no query site can forget the filter. Two deliberate
// seams remain: `findUnique` is left raw (the "find even if deleted" escape
// hatch, e.g. auditing), and a query that already names `deletedAt`
// explicitly wins - that is how "list deleted accounts" tooling would opt in.
import { Prisma } from "@prisma/client";

const SOFT_DELETE_MODELS = new Set(["User", "Admin", "Event"]);
const SCOPED_ACTIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
]);

const scopeWhere = (where) => {
  if (where && "deletedAt" in where) return where;
  return { ...where, deletedAt: null };
};

export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete-scope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && SCOPED_ACTIONS.has(operation)) {
          return query({ ...args, where: scopeWhere(args?.where) });
        }
        return query(args);
      },
    },
  },
});
