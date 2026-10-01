"""Control de integridad del sistema desplegado.

Comprueba que el motor que sirve la interfaz reproduce, sobre los datos reales,
la matriz de similitud, el ordenamiento, la capa de etiquetas y los precios de
referencia producidos en la etapa de modelación.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "api"))

from motor import MotorSameSame  # noqa: E402

TOLERANCIA_FLOAT32 = 1e-6


def leer_matriz(ruta: Path) -> np.ndarray:
    with open(ruta, encoding="utf-8", newline="") as archivo:
        return np.array([[float(v) for v in fila] for fila in csv.reader(archivo)], dtype=np.float32)


def main() -> int:
    motor = MotorSameSame()
    fallos: list[str] = []

    def comprobar(descripcion: str, condicion: bool, detalle: str = "") -> None:
        estado = "correcto" if condicion else "FALLA"
        print(f"  [{estado}] {descripcion}{(': ' + detalle) if detalle else ''}")
        if not condicion:
            fallos.append(descripcion)

    print("\n1. Integridad del catálogo")
    comprobar("El catálogo conserva las 645 fórmulas", len(motor.orden_formulas) == 645)
    comprobar("Las fórmulas se reparten en 147 de gama alta y 498 económicas",
              len(motor.ids_alta) == 147 and len(motor.ids_economica) == 498)
    comprobar("La capa de presentación agrupa 548 líneas comerciales", len(motor.lineas) == 548)
    comprobar("Toda fórmula tiene lista de ingredientes",
              all(motor.ingredientes_por_formula[f] for f in motor.orden_formulas))

    print("\n2. Reconstrucción de la matriz de similitud")
    ruta_matriz = RAIZ / "validacion" / "matriz_similitud_app.csv"
    if ruta_matriz.exists():
        referencia = leer_matriz(ruta_matriz)
        diferencia = float(np.abs(motor.similitud - referencia).max())
        comprobar("La matriz reconstruida coincide con la exportada",
                  diferencia < TOLERANCIA_FLOAT32, f"diferencia máxima {diferencia:.2e}")
    else:
        print("  [omitido] No se encontró la matriz exportada de referencia")

    print("\n3. Ordenamiento contra el ranking de la etapa de modelación")
    ruta_ranking = RAIZ / "validacion" / "ranking_top50_04a.csv"
    if ruta_ranking.exists():
        with open(ruta_ranking, encoding="utf-8-sig", newline="") as archivo:
            ranking = list(csv.DictReader(archivo))
        agrupado: dict[str, list[dict[str, str]]] = {}
        for fila in ranking:
            agrupado.setdefault(fila["id_formula_lujo"], []).append(fila)

        ids = np.array(motor.ids_economica)
        distintas, diferencia_maxima = [], 0.0
        for id_lujo, grupo in agrupado.items():
            grupo.sort(key=lambda f: int(f["posicion"]))
            fila = motor.fila_consulta[id_lujo]
            profundidad = len(grupo)
            esperado = np.array([f["id_formula_candidato"] for f in grupo])
            obtenido = ids[motor.orden_completo[fila, :profundidad]]
            if not np.array_equal(esperado, obtenido):
                distintas.append(id_lujo)
            valores = np.array([float(f["similitud"]) for f in grupo])
            diferencia_maxima = max(
                diferencia_maxima,
                float(np.abs(motor.similitud[fila, motor.orden_completo[fila, :profundidad]] - valores).max()),
            )
        comprobar("Las 147 consultas conservan el orden exportado",
                  len(agrupado) == 147 and not distintas, f"{len(distintas)} discrepancias")
        comprobar("Los valores de similitud coinciden",
                  diferencia_maxima < 1e-5, f"diferencia máxima {diferencia_maxima:.2e}")
    else:
        print("  [omitido] No se encontró el ranking de referencia")

    print("\n4. Capa de etiquetas contra los estadísticos por consulta")
    with open(RAIZ / "api" / "datos" / "estadisticos_consulta_app.csv", encoding="utf-8-sig", newline="") as archivo:
        estadisticos = list(csv.DictReader(archivo))
    d1 = d2 = 0
    for fila in estadisticos:
        i = motor.fila_consulta[fila["id_formula_lujo"]]
        d1 = max(d1, abs(int((motor.nivel[i] == 1).sum()) - int(fila["candidatas_nivel_1"])))
        d2 = max(d2, abs(int((motor.nivel[i] == 2).sum()) - int(fila["candidatas_nivel_2"])))
    comprobar("El conteo de candidatas de nivel 1 coincide en todas las consultas", d1 == 0)
    comprobar("El conteo de candidatas de nivel 2 coincide en todas las consultas", d2 == 0)
    comprobar("La asignación de nivel es exhaustiva y excluyente",
              set(np.unique(motor.nivel).tolist()) <= {1, 2, 3})
    comprobar("El umbral de separación se reproduce desde la matriz",
              abs(float(np.percentile(motor.separacion.max(axis=1), 10)) - motor.separacion_nivel_1) < 1e-4)

    print("\n5. Estabilidad del orden frente al ruido numérico")
    generador = np.random.default_rng(42)
    ruido = generador.uniform(-3e-16, 3e-16, motor.similitud.shape)
    perturbada = motor.similitud + ruido
    rango_perturbado = np.vstack(
        [motor._rango_promedio(perturbada[i], motor.tolerancia_empate) for i in range(perturbada.shape[0])]
    )
    percentil_perturbado = 100.0 * (1.0 - (rango_perturbado - 1.0) / perturbada.shape[1])
    mediana = np.median(perturbada, axis=1, keepdims=True)
    separacion_perturbada = (perturbada - mediana) / (1.4826 * np.median(np.abs(perturbada - mediana), axis=1, keepdims=True))
    nivel_perturbado = np.where(
        (percentil_perturbado >= motor.percentil_nivel_1) & (separacion_perturbada >= motor.separacion_nivel_1),
        1,
        np.where(percentil_perturbado >= motor.percentil_nivel_2, 2, 3),
    )
    comprobar("La tolerancia de empate está declarada en la configuración",
              motor.tolerancia_empate > 0, f"{motor.tolerancia_empate:.0e}")
    comprobar("Los niveles no cambian ante una perturbación del orden de la precisión de máquina",
              bool(np.array_equal(nivel_perturbado, motor.nivel)))

    print("\n6. Precios de referencia")
    comprobar("Todas las líneas comerciales tienen precio de referencia",
              len(motor.precios) == len(motor.lineas), f"{len(motor.precios)} de {len(motor.lineas)}")
    comprobar("Todos los precios son positivos",
              all(p["referencia"] > 0 and p["minimo"] > 0 for p in motor.precios.values()))
    comprobar("El mínimo nunca supera a la referencia ni la referencia al máximo",
              all(p["minimo"] <= p["referencia"] <= p["maximo"] for p in motor.precios.values()))
    comprobar("Cada línea declara un nivel de evidencia conocido",
              all(p["nivel_evidencia"] in motor.parametros_precio["niveles_evidencia"]
                  for p in motor.precios.values()))
    comprobar("Toda fórmula del catálogo resuelve su precio",
              all(motor.precio_de(f) is not None for f in motor.orden_formulas))
    cobertura = motor.cobertura_precio()
    print("      " + "; ".join(f"{k}: {v}" for k, v in sorted(cobertura.items())))

    print("\n7. Descomposición del puntaje")
    diferencias = []
    for id_lujo in motor.ids_alta[:40]:
        fila = motor.fila_consulta[id_lujo]
        for columna in motor.orden_completo[fila, :3]:
            id_dupe = motor.ids_economica[columna]
            detalle = motor.explicar(id_lujo, id_dupe)
            diferencias.append(abs(detalle["similitud"] - float(motor.similitud[fila, columna])))
    comprobar("La suma de aportes reconstruye el puntaje de la matriz",
              max(diferencias) < 1e-5, f"diferencia máxima {max(diferencias):.2e}")

    print("\n8. Robustez de la recuperación bajo todas las combinaciones de filtros")
    formatos = sorted({r["formato"] for r in motor.catalogo.values()})
    combinaciones = 0
    for etico in (False, True):
        for vegano in (False, True):
            for formato in [None] + [[f] for f in formatos]:
                for id_lujo in motor.ids_alta[::30]:
                    respuesta = motor.alternativas(id_lujo, etico=etico, vegano=vegano, formatos=formato, n=5)
                    combinaciones += 1
                    if respuesta["universo"]["tras_filtros"] > 0 and not respuesta["resultados"]:
                        fallos.append(f"Consulta vacía con universo no vacío en {id_lujo}")
    comprobar(f"Las {combinaciones} combinaciones evaluadas devuelven resultados coherentes", not fallos)

    print("\n9. Pares documentados por la comunidad")
    pares = motor.cargar_pares_documentados(RAIZ / "api" / "datos" / "pares_documentados.csv")
    conteo = {1: 0, 2: 0, 3: 0}
    for par in pares:
        conteo[par["nivel"]] += 1
    comprobar("Los 36 pares documentados se resuelven contra el catálogo", len(pares) == 36)
    comprobar("Todos los pares documentados tienen ahorro calculable",
              all(par["ahorro"] is not None for par in pares))
    print(f"      nivel 1: {conteo[1]}   nivel 2: {conteo[2]}   nivel 3: {conteo[3]}")

    print("\n" + ("Sistema validado sin discrepancias" if not fallos else f"Se detectaron {len(fallos)} discrepancias"))
    return 0 if not fallos else 1


if __name__ == "__main__":
    raise SystemExit(main())
