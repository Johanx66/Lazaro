import { z } from 'zod';
import { defineTool } from './tool-registry.js';

const CustomerBalanceSchema = z.object({});

export interface CustomerBalanceRow {
  customer_id: string;
  balance: string;
  credit_limit: string;
}

export const getCustomerBalanceTool = defineTool({
  name: 'get_customer_balance',
  description: 'Obtiene el saldo disponible y límite de crédito del cliente autenticado.',
  schema: CustomerBalanceSchema,
  allowedRoles: ['USER', 'ADMIN'],
  async executeQuery(_params, context, companyDb): Promise<CustomerBalanceRow | null> {
    const query = `
      SELECT customer_id, balance, credit_limit
      FROM v_customer_balance
      WHERE customer_id = $1;
    `;
    const result = await companyDb.query<CustomerBalanceRow>(query, [context.companyCustomerId]);
    return result.rows[0] ?? null;
  },
});
