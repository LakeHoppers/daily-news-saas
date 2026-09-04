import type { Category } from "@/generated/prisma/enums";
import { getLatestDigest } from "@/modules/digest/infrastructure/digest-view";
import type { DigestReader } from "../application/ports";

export class PrismaDigestReader implements DigestReader {
  getLatestDigest(categories: Category[]) {
    return getLatestDigest(categories);
  }
}
