import type { Category } from "@/generated/prisma/enums";

export const CATEGORY_LABELS_TR: Record<Category, string> = {
  POLITICS: "Politika",
  ECONOMY: "Ekonomi",
  IMMIGRATION: "Göç",
  BERLIN: "Berlin",
  TECHNOLOGY: "Teknoloji",
  EUROPE: "Avrupa",
  BUSINESS: "İş Dünyası",
  SOCIETY: "Toplum",
  SPORTS: "Spor",
};

export const CATEGORY_LABELS_EN: Record<Category, string> = {
  POLITICS: "Politics",
  ECONOMY: "Economy",
  IMMIGRATION: "Immigration",
  BERLIN: "Berlin",
  TECHNOLOGY: "Technology",
  EUROPE: "Europe",
  BUSINESS: "Business",
  SOCIETY: "Society",
  SPORTS: "Sports",
};

export const CATEGORY_LABELS = { tr: CATEGORY_LABELS_TR, en: CATEGORY_LABELS_EN };
