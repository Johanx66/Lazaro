-- La sesión de chat se identifica por (channel, contactId). El sessionId/token
-- no se consumía en ninguna parte, así que se elimina la columna y su índice único.
ALTER TABLE "chat_sessions" DROP COLUMN "sessionIdHash";
