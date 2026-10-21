import { z } from 'zod';
import { defineTool } from './tool-registry.js';

const RecentOrdersSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
});

export interface RecentOrderRow {
  order_id: string;
  status: string;
  total_amount: string;
  created_at: Date;
}

export const getRecentOrdersTool = defineTool({
  name: 'get_recent_orders',
  description: 'Lista los pedidos más recientes del cliente autenticado.',
  schema: RecentOrdersSchema,
  allowedRoles: ['USER', 'ADMIN'],
  async executeQuery(params, context, companyDb): Promise<RecentOrderRow[]> {
    const query = `
      SELECT order_id, status, total_amount, created_at
      FROM v_recent_orders
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const result = await companyDb.query<RecentOrderRow>(query, [
      context.companyCustomerId,
      params.limit,
    ]);
    return result.rows;
  },
});
