import { describe, expect, it } from "vitest";
import { CreateKnowledgeUseCase } from "../../../../src/modules/knowledge/application/use-cases/create-knowledge.js";
import { GetKnowledgeUseCase } from "../../../../src/modules/knowledge/application/use-cases/get-knowledge.js";
import { ListKnowledgeUseCase } from "../../../../src/modules/knowledge/application/use-cases/list-knowledge.js";
import { UpdateKnowledgeUseCase } from "../../../../src/modules/knowledge/application/use-cases/update-knowledge.js";
import type { CreateKnowledgeInput, KnowledgeArticle } from "../../../../src/modules/knowledge/domain/entities/knowledge-article.js";
import type { ListKnowledgeFilters, UpdateKnowledgeInput } from "../../../../src/modules/knowledge/domain/entities/knowledge-article.js";
import type { KnowledgeRepository } from "../../../../src/modules/knowledge/domain/repositories/knowledge-repository.js";
import { NotFoundError, ValidationError } from "../../../../src/shared/errors/app.error.js";

const baseArticle: KnowledgeArticle = {
  id: "k1",
  title: "Cómo imprimir una factura",
  content: "Abra el módulo de facturación y use la opción Imprimir.",
  category: "Facturación",
  keywords: ["factura", "imprimir"],
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeRepository(overrides: Partial<KnowledgeRepository> = {}): KnowledgeRepository {
  let store = new Map<string, KnowledgeArticle>([[baseArticle.id, { ...baseArticle }]]);
  return {
    listActive: overrides.listActive ?? (async (filters: ListKnowledgeFilters) => {
      const articles = [...store.values()].filter((article) => article.active);
      if (filters.category !== undefined) {
        return articles.filter((article) => article.category === filters.category);
      }
      return articles;
    }),
    listPage: overrides.listPage ?? (async (filters) => {
      const items = [...store.values()].filter(
        (article) => filters.category === undefined || article.category === filters.category,
      );
      return { items, page: filters.page, pageSize: filters.pageSize, total: items.length };
    }),
    findById: overrides.findById ?? (async (id: string) => (store.get(id) ? { ...store.get(id)! } : null)),
    create: overrides.create ?? (async (input: CreateKnowledgeInput) => {
      const article: KnowledgeArticle = { id: "k-new", ...input, active: true, createdAt: new Date(), updatedAt: new Date() };
      store.set(article.id, article);
      return article;
    }),
    update:
      overrides.update ??
      (async (id: string, input: UpdateKnowledgeInput) => {
        const current = store.get(id);
        if (!current) return null;
        const updated = { ...current, ...input, id, updatedAt: new Date() };
        store.set(id, updated);
        return updated;
      }),
  };
}

describe("CreateKnowledgeUseCase", () => {
  it("crea un artículo y normaliza keywords (minúsculas, sin duplicados)", async () => {
    const useCase = new CreateKnowledgeUseCase(makeRepository());
    const article = await useCase.execute({
      title: "  Error de conexión  ",
      content: "  Verifique el servidor.  ",
      category: "  Errores  ",
      keywords: [" Servidor ", "servidor", " conexion ", "", " "],
    });
    expect(article.title).toBe("Error de conexión");
    expect(article.content).toBe("Verifique el servidor.");
    expect(article.category).toBe("Errores");
    expect(article.keywords).toEqual(["servidor", "conexion"]);
  });

  it("rechaza título vacío", async () => {
    const useCase = new CreateKnowledgeUseCase(makeRepository());
    await expect(
      useCase.execute({ title: "  ", content: "cuerpo", category: "general", keywords: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza contenido vacío", async () => {
    const useCase = new CreateKnowledgeUseCase(makeRepository());
    await expect(
      useCase.execute({ title: "Título", content: "  ", category: "general", keywords: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza más de 10 keywords", async () => {
    const useCase = new CreateKnowledgeUseCase(makeRepository());
    await expect(
      useCase.execute({
        title: "Título",
        content: "cuerpo",
        category: "general",
        keywords: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza keyword demasiado larga", async () => {
    const useCase = new CreateKnowledgeUseCase(makeRepository());
    await expect(
      useCase.execute({ title: "Título", content: "cuerpo", category: "general", keywords: ["x".repeat(41)] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ListKnowledgeUseCase", () => {
  it("devuelve la forma paginada con valores por defecto", async () => {
    const useCase = new ListKnowledgeUseCase(makeRepository());
    const result = await useCase.execute({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("filtra por categoría", async () => {
    const useCase = new ListKnowledgeUseCase(makeRepository());
    const result = await useCase.execute({ category: "Facturación" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe("Cómo imprimir una factura");
  });

  it("rechaza categoría vacía en el filtro", async () => {
    const useCase = new ListKnowledgeUseCase(makeRepository());
    await expect(useCase.execute({ category: "  " })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("GetKnowledgeUseCase", () => {
  it("obtiene un artículo existente", async () => {
    const useCase = new GetKnowledgeUseCase(makeRepository());
    const article = await useCase.execute("k1");
    expect(article.id).toBe("k1");
  });

  it("lanza NotFoundError si no existe", async () => {
    const useCase = new GetKnowledgeUseCase(makeRepository());
    await expect(useCase.execute("k-no")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UpdateKnowledgeUseCase", () => {
  it("actualiza campos y normaliza keywords", async () => {
    const useCase = new UpdateKnowledgeUseCase(makeRepository());
    const article = await useCase.execute("k1", { title: " Impresión de factura ", keywords: [" Imprimir "], active: false });
    expect(article.title).toBe("Impresión de factura");
    expect(article.keywords).toEqual(["imprimir"]);
    expect(article.active).toBe(false);
  });

  it("actualiza solo los campos provistos", async () => {
    const useCase = new UpdateKnowledgeUseCase(makeRepository());
    const article = await useCase.execute("k1", { active: false });
    expect(article.title).toBe(baseArticle.title);
    expect(article.content).toBe(baseArticle.content);
    expect(article.active).toBe(false);
  });

  it("lanza NotFoundError si no existe", async () => {
    const useCase = new UpdateKnowledgeUseCase(makeRepository());
    await expect(useCase.execute("k-no", { title: "nuevo" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza título vacío en actualización", async () => {
    const useCase = new UpdateKnowledgeUseCase(makeRepository());
    await expect(useCase.execute("k1", { title: "  " })).rejects.toBeInstanceOf(ValidationError);
  });
});