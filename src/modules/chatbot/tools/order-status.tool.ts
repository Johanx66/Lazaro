import { z } from 'zod';
import { defineTool } from './tool-registry.js';

const OrderStatusSchema = z.object({
  orderId: z.string().min(1),
});

export interface OrderStatusRow {
  order_id: string;
  status: string;
  total_amount: string;
  created_at: Date;
}

export const getOrderStatusTool = defineTool({
  name: 'get_order_status',
  description: 'Obtiene el estado de un pedido específico del usuario autenticado.',
  schema: OrderStatusSchema,
  allowedRoles: ['USER', 'ADMIN'],
  async executeQuery(params, context, companyDb): Promise<OrderStatusRow | null> {
    // AISLAMIENTO: userId proviene ESTRICTAMENTE de context.authenticatedUserId
    const query = `
      SELECT order_id, status, total_amount, created_at
      FROM v_orders_status
      WHERE order_id = $1 AND customer_id = $2
      LIMIT 1;
    `;
    const result = await companyDb.query<OrderStatusRow>(query, [params.orderId, context.authenticatedUserId]);
    return result.rows[0] ?? null;
  },
});
