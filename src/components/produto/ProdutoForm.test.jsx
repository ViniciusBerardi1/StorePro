import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProdutoForm from "./ProdutoForm";

const categorias = [
  { id: 1, nome: "Skincare" },
  { id: 2, nome: "Cabelo" },
];

const defaultProps = {
  produto: null,
  categorias,
  onSalvar: vi.fn(),
  onFechar: vi.fn(),
};

function renderForm(props = {}) {
  return render(<ProdutoForm {...defaultProps} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProdutoForm — validações", () => {
  it("bloqueia salvar sem nome preenchido", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderForm();
    fireEvent.click(screen.getByText("Salvar"));
    expect(defaultProps.onSalvar).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Informe o nome do produto.");
    alertSpy.mockRestore();
  });

  it("bloqueia quando quantidade é negativa", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderForm();
    fireEvent.change(screen.getByLabelText("Nome do produto *"), {
      target: { value: "Hidratante" },
    });
    // Força quantidade negativa diretamente no input de número
    const qtdInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(qtdInput, { target: { value: "-1" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect(defaultProps.onSalvar).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Quantidade não pode ser negativa.");
    alertSpy.mockRestore();
  });

  it("chama onSalvar com dados válidos", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Nome do produto *"), {
      target: { value: "Hidratante" },
    });
    fireEvent.click(screen.getByText("Salvar"));
    expect(defaultProps.onSalvar).toHaveBeenCalledOnce();
    expect(defaultProps.onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Hidratante" })
    );
  });

  it("bloqueia quando tamanho está ativo mas valor está vazio", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderForm();
    fireEvent.change(screen.getByLabelText("Nome do produto *"), {
      target: { value: "Shampoo" },
    });
    fireEvent.click(screen.getByTestId("toggle-tamanho"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(defaultProps.onSalvar).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Informe a quantidade do tamanho do produto."
    );
    alertSpy.mockRestore();
  });

  it("chama onFechar ao clicar em Cancelar", () => {
    renderForm();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(defaultProps.onFechar).toHaveBeenCalledOnce();
  });

  it("mostra 'Editar produto' quando produto é passado", () => {
    renderForm({
      produto: {
        id: 1,
        nome: "Base",
        data_validade: "2027-01-01",
        quantidade: 1,
        estoque_minimo: 1,
        categoria_id: 1,
        tem_cor: 0,
        cor: "",
        loja_compra: "sephora",
        avaliacao: 0,
        tem_tamanho: 0,
        tamanho_quantidade: "",
        tamanho_unidade: "ml",
      },
    });
    expect(screen.getByText("Editar produto")).toBeInTheDocument();
  });

  it("mostra 'Novo produto' quando nenhum produto é passado", () => {
    renderForm();
    expect(screen.getByText("Novo produto")).toBeInTheDocument();
  });
});
