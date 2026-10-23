import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { LlmProvider } from '../domain/llm-provider.js';
import { getCustomerBalanceTool } from '../tools/customer-balance.tool.js';
import { getRecentOrdersTool } from '../tools/recent-orders.tool.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { QueryDataUseCase } from './query-data-use-case.js';

describe('QueryDataUseCase.executeTool', () => {
  it('ejecuta la herramienta fija y parametriza siempre el cliente de sesión sin llamar al LLM', async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => {
      expect(params[0]).toBe('USR_101');
      return { rows: [{ customer_id: 'USR_101', balance: '150.50', credit_limit: '500.00' }] };
    });
    const db = { query } as unknown as Pool;
    const llm: LlmProvider = { generateCompletion: vi.fn(async () => { throw new Error('no debe invocarse'); }) };
    const registry = new ToolRegistry();
    registry.register(getCustomerBalanceTool);
    registry.register(getRecentOrdersTool);
    const useCase = new QueryDataUseCase(llm, registry, db, 10);
    const result = await useCase.executeTool('get_customer_balance', { companyUserId: 'u1', role: 'USER', companyCustomerId: 'USR_101' });
    expect(result.reply).toContain('$150.50');
    expect(query).toHaveBeenCalledOnce();
    expect(llm.generateCompletion).not.toHaveBeenCalled();
  });
});
