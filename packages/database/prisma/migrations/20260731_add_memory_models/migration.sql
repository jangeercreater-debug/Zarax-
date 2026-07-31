-- CreateTable UserMemory
CREATE TABLE "user_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'voice',
    "call_id" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable ConversationSummary
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "key_points" JSONB NOT NULL DEFAULT '[]',
    "mood" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_memories_user_id_tenant_id_idx" ON "user_memories"("user_id", "tenant_id");
CREATE INDEX "user_memories_user_id_tenant_id_category_idx" ON "user_memories"("user_id", "tenant_id", "category");
CREATE INDEX "conversation_summaries_user_id_tenant_id_idx" ON "conversation_summaries"("user_id", "tenant_id");
