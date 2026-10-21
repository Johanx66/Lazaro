-- Código de cliente en la BD de la empresa (p. ej. "CLI-000123"). Es la clave con
-- la que el chatbot filtra las consultas de datos del chat. Lo asigna un ADMIN
-- desde el panel. Es único: dos usuarios de empresa no pueden apuntar al mismo
-- cliente. Varios NULL son permitidos (clientes aún no vinculados).
ALTER TABLE "company_users" ADD COLUMN "companyCustomerId" TEXT;

CREATE UNIQUE INDEX "company_users_companyCustomerId_key" ON "company_users"("companyCustomerId");
