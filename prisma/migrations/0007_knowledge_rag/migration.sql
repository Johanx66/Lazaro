CREATE TABLE "knowledge_entries" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "variations" TEXT[] NOT NULL,
  "keywords" TEXT[] NOT NULL,
  "answer" TEXT NOT NULL,
  "answerAfterRegistration" TEXT,
  "priority" TEXT NOT NULL,
  "escalationMode" TEXT NOT NULL,
  "escalationReason" TEXT,
  "requiredData" JSONB NOT NULL,
  "suggestedActions" JSONB NOT NULL,
  "confirmationQuestion" TEXT,
  "tool" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_entries_active_category_idx" ON "knowledge_entries"("active", "category");

CREATE TABLE "KnowledgeChunk" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "embedding" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "dim" INTEGER NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeChunk_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "KnowledgeChunk_entryId_type_hash_key" ON "KnowledgeChunk"("entryId", "type", "hash");
CREATE INDEX "KnowledgeChunk_entryId_idx" ON "KnowledgeChunk"("entryId");
