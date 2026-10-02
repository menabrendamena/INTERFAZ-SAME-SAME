"""Motor de recuperación y explicación de Same Same.

Reconstruye la representación del modelo de similitud a partir de los archivos
exportados por la etapa de sistema consultable, calcula la escala de comparación
entre consultas, traduce cada puntaje a una etiqueta categórica calibrada y
resuelve el precio de referencia y el ahorro de cada comparación.
"""

from __future__ import annotations

import csv
import json
import math
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

DIRECTORIO_DATOS = Path(__file__).resolve().parent / "datos"

FACTOR_DAM = 1.4826
TOLERANCIA_EMPATE_POR_OMISION = 1e-12

NOMBRE_VARIABLE = {
    "n_ingredientes_base": "longitud del vehículo",
    "n_funciones": "diversidad de funciones",
    "n_destacados": "ingredientes destacados",
    "prop_emoliente": "carga emoliente",
    "prop_control_viscosidad": "control de viscosidad",
    "prop_antioxidante": "carga antioxidante",
    "prop_perfume": "carga de perfume",
    "prop_conservador": "sistema conservador",
    "prop_solvente": "carga de solventes",
    "prop_humectante": "carga humectante",
    "prop_emulsionante": "carga emulsionante",
    "prop_tensioactivo": "carga tensioactiva",
    "prop_identico_piel": "componentes idénticos a la piel",
    "prop_abrasivo": "carga abrasiva",
    "prop_calmante": "carga calmante",
    "prop_antimicrobiano": "carga antimicrobiana",
    "prop_regulador_ph": "regulación de pH",
    "prop_comunicador_celular": "comunicadores celulares",
    "prop_quelante": "agentes quelantes",
    "prop_exfoliante": "carga exfoliante",
    "prop_aclarante": "agentes aclarantes",
    "prop_superstar": "ingredientes de calificación superior",
    "prop_goodie": "ingredientes bien calificados",
    "prop_no_take": "ingredientes sin calificación favorable",
    "prop_icky": "ingredientes mal calificados",
    "prop_sin_calificacion": "ingredientes sin calificación editorial",
    "rango_primer_emoliente": "posición del primer emoliente",
    "rango_primer_humectante": "posición del primer humectante",
    "rango_primer_control_viscosidad": "posición del primer estructurante",
}

NOMBRE_LLANO = {
    "n_ingredientes_base": "Longitud de la fórmula",
    "n_funciones": "Variedad de funciones",
    "n_destacados": "Ingredientes destacados",
    "prop_emoliente": "Deslizamiento y confort",
    "prop_control_viscosidad": "Cuerpo y estructura",
    "prop_antioxidante": "Antioxidantes",
    "prop_perfume": "Perfume",
    "prop_conservador": "Conservación",
    "prop_solvente": "Componentes ligeros",
    "prop_humectante": "Retención de agua",
    "prop_emulsionante": "Mezcla de aceite y agua",
    "prop_tensioactivo": "Tensioactivos",
    "prop_identico_piel": "Componentes afines a la piel",
    "prop_abrasivo": "Partículas abrasivas",
    "prop_calmante": "Calmantes",
    "prop_antimicrobiano": "Antimicrobianos",
    "prop_regulador_ph": "Regulación de pH",
    "prop_comunicador_celular": "Comunicadores celulares",
    "prop_quelante": "Estabilizadores",
    "prop_exfoliante": "Componentes de renovación",
    "prop_aclarante": "Aclarantes",
    "prop_superstar": "Ingredientes con la mejor valoración",
    "prop_goodie": "Ingredientes con buena valoración",
    "prop_no_take": "Ingredientes de uso común",
    "prop_icky": "Ingredientes con mala valoración",
    "prop_sin_calificacion": "Ingredientes sin valoración",
    "rango_primer_emoliente": "Qué tan pronto aparece el emoliente",
    "rango_primer_humectante": "Qué tan pronto aparece el humectante",
    "rango_primer_control_viscosidad": "Qué tan pronto aparece el espesante",
}

GLOSARIO_LLANO = [
    ("Perfil dominado por ", "Destaca por "),
    ("ingredientes sin calificación favorable", "ingredientes de uso común"),
    ("ingredientes de calificación superior", "ingredientes con la mejor valoración"),
    ("ingredientes sin calificación editorial", "ingredientes sin valoración"),
    ("ingredientes mal calificados", "ingredientes con mala valoración"),
    ("ingredientes bien calificados", "ingredientes con buena valoración"),
    ("control de viscosidad", "espesantes que dan cuerpo"),
    ("diversidad de funciones", "variedad de funciones"),
    ("carga exfoliante", "componentes de renovación"),
    ("carga antioxidante", "antioxidantes"),
    ("carga de solventes", "componentes ligeros"),
    ("carga humectante", "humectantes"),
    ("carga de perfume", "perfume"),
    ("carga emoliente", "emolientes que dan deslizamiento"),
    ("agentes quelantes", "estabilizadores"),
    ("agentes aclarantes", "aclarantes"),
    ("sistema conservador", "conservadores"),
]

ETIQUETA_CALIFICACION = {
    "superstar": "calificación superior",
    "goodie": "bien calificado",
    "no-take": "sin calificación favorable",
    "icky": "mal calificado",
}

NOMBRE_FORMATO = {
    "barra": "Barra",
    "gloss": "Gloss",
    "balsamo": "Bálsamo",
    "aceite": "Aceite",
    "delineador": "Delineador",
    "tinte": "Tinte",
    "liquido": "Líquido",
}

ORDENES_DISPONIBLES = ("marca", "precio-asc", "precio-desc", "nombre")

VARIABLES_TEXTURA = (
    "prop_emoliente",
    "prop_control_viscosidad",
    "prop_humectante",
    "prop_solvente",
    "prop_antioxidante",
    "prop_perfume",
)


def _texto_plano(valor: str) -> str:
    """Normaliza a minúsculas sin acentos para búsqueda tolerante."""
    descompuesto = unicodedata.normalize("NFKD", str(valor))
    return "".join(c for c in descompuesto if not unicodedata.combining(c)).lower().strip()


def _en_lenguaje_llano(texto: str) -> str:
    """Sustituye el vocabulario técnico del catálogo por su equivalente de uso corriente."""
    resultado = str(texto or "")
    for tecnico, llano in GLOSARIO_LLANO:
        resultado = resultado.replace(tecnico, llano)
    return resultado


def _minuscula_inicial(texto: str) -> str:
    """Baja solo la primera letra, de modo que una etiqueta pueda insertarse dentro de una
    oración sin alterar siglas ni notaciones como pH."""
    cadena = str(texto or "")
    return cadena[:1].lower() + cadena[1:]


def _enumerar(elementos: list[str]) -> str:
    """Encadena una lista con la conjunción española. Cuando algún elemento ya contiene una
    conjunción, separa con comas para no producir dos conjunciones seguidas."""
    limpios = [e for e in elementos if e]
    if not limpios:
        return ""
    if len(limpios) == 1:
        return limpios[0]
    if any(" y " in e for e in limpios):
        return ", ".join(limpios)
    return ", ".join(limpios[:-1]) + " y " + limpios[-1]


def _leer_csv(ruta: Path) -> list[dict[str, str]]:
    with open(ruta, encoding="utf-8-sig", newline="") as archivo:
        return list(csv.DictReader(archivo))


def _booleano(valor: str) -> bool:
    return str(valor).strip().lower() in {"true", "1", "si", "sí", "verdadero"}


def _normalizar_filas(matriz: np.ndarray) -> np.ndarray:
    normas = np.linalg.norm(matriz, axis=1, keepdims=True)
    normas[normas == 0.0] = 1.0
    return matriz / normas


def _pesos(valor: float | int | None) -> str:
    if valor is None:
        return ""
    return f"${int(round(valor)):,}"


class MotorSameSame:
    """Sistema consultable sobre el catálogo de fórmulas labiales."""

    def __init__(self, directorio: Path | str = DIRECTORIO_DATOS) -> None:
        self.directorio = Path(directorio)
        self._cargar_configuracion()
        self._cargar_precios()
        self._cargar_catalogo()
        self._cargar_ingredientes()
        self._cargar_perfil()
        self._construir_representacion()
        self._calcular_escala()
        self._construir_indices_presentacion()

    # ------------------------------------------------------------------
    # Carga
    # ------------------------------------------------------------------
    def _cargar_configuracion(self) -> None:
        with open(self.directorio / "configuracion_app.json", encoding="utf-8") as archivo:
            self.configuracion = json.load(archivo)

        modelo = self.configuracion["modelo"]
        self.alfa = float(modelo["alfa_ingredientes"])
        self.rango_maximo = int(modelo["rango_maximo"])
        self.k_negocio = int(modelo["k_negocio"])
        self.tolerancia_empate = float(
            modelo.get("tolerancia_empate", TOLERANCIA_EMPATE_POR_OMISION)
        )

        escala = self.configuracion["escala"]
        self.percentil_nivel_1 = float(escala["percentil_nivel_1"])
        self.separacion_nivel_1 = float(escala["separacion_nivel_1"])
        self.percentil_nivel_2 = float(escala["percentil_nivel_2"])

        self.etiquetas = {int(k): v for k, v in self.configuracion["etiquetas"].items()}
        self.nombres_arquetipo = {
            int(k): v for k, v in self.configuracion["arquetipos"]["nombres"].items()
        }
        self.nombres_arquetipo_llanos = {
            k: _en_lenguaje_llano(v) for k, v in self.nombres_arquetipo.items()
        }
        self.parametros_precio = self.configuracion.get("precios", {})

    def _cargar_precios(self) -> None:
        ruta = self.directorio / "precios_linea_app.csv"
        self.precios: dict[str, dict[str, Any]] = {}
        if not ruta.exists():
            return
        for fila in _leer_csv(ruta):
            self.precios[fila["clave_linea"]] = {
                "nivel_evidencia": fila["nivel_evidencia"],
                "referencia": int(float(fila["precio_referencia"])),
                "minimo": int(float(fila["precio_min"])),
                "maximo": int(float(fila["precio_max"])),
                "texto": fila["texto_interfaz"],
                "es_observado": fila["nivel_evidencia"].startswith("Observado"),
            }

    def _cargar_catalogo(self) -> None:
        filas = _leer_csv(self.directorio / "catalogo_app.csv")
        tonos = {f["id_formula"]: f for f in _leer_csv(self.directorio / "tonos_app.csv")}

        self.catalogo: dict[str, dict[str, Any]] = {}
        self.orden_formulas: list[str] = []

        for fila in filas:
            identificador = fila["id_formula"]
            detalle_tono = tonos.get(identificador, {})
            efectos = [
                efecto.strip()
                for efecto in fila["efectos"].split(",")
                if efecto.strip() and efecto.strip() != "sin efecto declarado"
            ]
            arquetipo = int(fila["arquetipo"])
            acabado = fila["acabado"]
            registro = {
                "id_formula": identificador,
                "marca": fila["marca"],
                "marca_catalogo": fila["marca_catalogo"],
                "nombre": fila["nombre"],
                "gama": fila["gama"],
                "formato": fila["formato"],
                "formato_nombre": NOMBRE_FORMATO.get(fila["formato"], fila["formato"]),
                "acabado": acabado,
                "acabado_declarado": acabado != "no_declarado",
                "efectos": efectos,
                "aptitud_vegana": fila["aptitud_vegana"],
                "es_vegana": _booleano(fila["es_vegana"]),
                "clasificacion_etica": fila["clasificacion_etica"],
                "es_libre_crueldad": _booleano(fila["es_libre_crueldad"]),
                "arquetipo": arquetipo,
                "nombre_arquetipo": self.nombres_arquetipo.get(arquetipo, ""),
                "tipo_formula": self.nombres_arquetipo_llanos.get(arquetipo, ""),
                "n_ingredientes_base": int(fila["n_ingredientes_base"]),
                "formato_baja_confianza": _booleano(fila["formato_baja_confianza"]),
                "url_representante": fila["url_representante"],
                "clave_linea": fila["clave_linea"],
                "es_representante_linea": _booleano(fila["es_representante_linea"]),
                "tono": detalle_tono.get("tono", "").strip(),
                "calificador_presentacion": detalle_tono.get("calificador_presentacion", "").strip(),
                "precio": self.precios.get(fila["clave_linea"]),
            }
            registro["busqueda"] = _texto_plano(
                f"{registro['marca']} {registro['nombre']} {registro['tono']}"
            )
            self.catalogo[identificador] = registro
            self.orden_formulas.append(identificador)

        self.orden_formulas.sort()
        self.indice_formula = {f: i for i, f in enumerate(self.orden_formulas)}
        self.ids_alta = [f for f in self.orden_formulas if self.catalogo[f]["gama"] == "alta"]
        self.ids_economica = [
            f for f in self.orden_formulas if self.catalogo[f]["gama"] == "economica"
        ]
        self.fila_consulta = {f: i for i, f in enumerate(self.ids_alta)}
        self.columna_candidata = {f: j for j, f in enumerate(self.ids_economica)}

    def _cargar_ingredientes(self) -> None:
        filas = _leer_csv(self.directorio / "ingredientes_app.csv")
        self.ingredientes_por_formula: dict[str, list[dict[str, Any]]] = {
            f: [] for f in self.orden_formulas
        }
        self.nombre_ingrediente: dict[str, str] = {}
        self.soporte_ingrediente: dict[str, int] = {}
        self.poco_comun: dict[str, bool] = {}

        for fila in filas:
            clave = fila["ingrediente"]
            registro = {
                "ingrediente": clave,
                "nombre": fila["nombre_ingrediente"],
                "rango_base": int(fila["rango_base"]),
                "calificacion": fila["calificacion"],
                "formulas_del_catalogo": int(fila["formulas_del_catalogo"]),
                "poco_comun": _booleano(fila["poco_comun"]),
            }
            self.ingredientes_por_formula[fila["id_formula"]].append(registro)
            self.nombre_ingrediente[clave] = registro["nombre"]
            self.soporte_ingrediente[clave] = registro["formulas_del_catalogo"]
            self.poco_comun[clave] = registro["poco_comun"]

        for lista in self.ingredientes_por_formula.values():
            lista.sort(key=lambda r: r["rango_base"])

        self.vocabulario = sorted(self.nombre_ingrediente)
        self.indice_ingrediente = {v: k for k, v in enumerate(self.vocabulario)}

    def _cargar_perfil(self) -> None:
        filas = _leer_csv(self.directorio / "perfil_app.csv")
        self.variables_perfil = [c for c in filas[0] if c != "id_formula"]
        perfil = np.zeros((len(self.orden_formulas), len(self.variables_perfil)), dtype=float)
        for fila in filas:
            posicion = self.indice_formula[fila["id_formula"]]
            perfil[posicion] = [float(fila[v]) for v in self.variables_perfil]
        self.matriz_perfil = perfil

    # ------------------------------------------------------------------
    # Representación y escala
    # ------------------------------------------------------------------
    def _construir_representacion(self) -> None:
        base = np.zeros((len(self.orden_formulas), len(self.vocabulario)), dtype=float)
        self.claves_en_corte: dict[str, set[str]] = {}
        for identificador, lista in self.ingredientes_por_formula.items():
            posicion = self.indice_formula[identificador]
            dentro = {r["ingrediente"] for r in lista if r["rango_base"] <= self.rango_maximo}
            self.claves_en_corte[identificador] = dentro
            for clave in dentro:
                base[posicion, self.indice_ingrediente[clave]] = 1.0
        self.matriz_base = base

        self.base_normalizada = _normalizar_filas(base)
        self.perfil_normalizado = _normalizar_filas(self.matriz_perfil)

        posiciones_alta = [self.indice_formula[f] for f in self.ids_alta]
        posiciones_economica = [self.indice_formula[f] for f in self.ids_economica]

        coseno_ingredientes = (
            self.base_normalizada[posiciones_alta] @ self.base_normalizada[posiciones_economica].T
        )
        coseno_perfil = (
            self.perfil_normalizado[posiciones_alta]
            @ self.perfil_normalizado[posiciones_economica].T
        )
        self.similitud = self.alfa * coseno_ingredientes + (1.0 - self.alfa) * coseno_perfil

    @staticmethod
    def _rango_promedio(fila: np.ndarray, tolerancia: float) -> np.ndarray:
        """Rango descendente con rango promedio en los empates.

        Dos similitudes que difieren en menos de la tolerancia se tratan como
        iguales, de modo que el ruido de la aritmética de coma flotante no altera
        el orden ni, por lo tanto, la etiqueta asignada.
        """
        ordenada = np.sort(fila)
        hasta = np.searchsorted(ordenada, fila + tolerancia, side="right")
        desde = np.searchsorted(ordenada, fila - tolerancia, side="left")
        return (len(fila) - hasta) + (hasta - desde + 1) / 2.0

    def _calcular_escala(self) -> None:
        matriz = self.similitud
        n_candidatas = matriz.shape[1]

        self.rango = np.vstack(
            [self._rango_promedio(matriz[i], self.tolerancia_empate) for i in range(matriz.shape[0])]
        )
        self.percentil = 100.0 * (1.0 - (self.rango - 1.0) / n_candidatas)
        self.orden_completo = np.argsort(-matriz, axis=1, kind="stable")

        self.mediana_consulta = np.median(matriz, axis=1, keepdims=True)
        self.dam_consulta = np.median(
            np.abs(matriz - self.mediana_consulta), axis=1, keepdims=True
        )
        self.separacion = (matriz - self.mediana_consulta) / (FACTOR_DAM * self.dam_consulta)

        alto = (self.percentil >= self.percentil_nivel_1) & (
            self.separacion >= self.separacion_nivel_1
        )
        intermedio = self.percentil >= self.percentil_nivel_2
        self.nivel = np.where(alto, 1, np.where(intermedio, 2, 3))

    def _construir_indices_presentacion(self) -> None:
        self.lineas: dict[str, dict[str, Any]] = {}
        for identificador in self.orden_formulas:
            registro = self.catalogo[identificador]
            clave = registro["clave_linea"]
            linea = self.lineas.setdefault(
                clave,
                {
                    "clave_linea": clave,
                    "marca": registro["marca"],
                    "marca_catalogo": registro["marca_catalogo"],
                    "nombre": registro["nombre"],
                    "gama": registro["gama"],
                    "formatos": set(),
                    "acabados": set(),
                    "efectos": set(),
                    "tonos": [],
                    "formulas": [],
                    "id_representante": identificador,
                },
            )
            linea["formatos"].add(registro["formato"])
            if registro["acabado_declarado"]:
                linea["acabados"].add(registro["acabado"])
            linea["efectos"].update(registro["efectos"])
            linea["formulas"].append(identificador)
            if registro["tono"]:
                linea["tonos"].append(registro["tono"])
            if registro["es_representante_linea"]:
                linea["id_representante"] = identificador
                linea["nombre"] = registro["nombre"]

        for linea in self.lineas.values():
            representante = self.catalogo[linea["id_representante"]]
            linea["formatos"] = sorted(linea["formatos"])
            linea["acabados"] = sorted(linea["acabados"])
            linea["efectos"] = sorted(linea["efectos"])
            linea["formato"] = representante["formato"]
            linea["n_formulas"] = len(linea["formulas"])
            linea["es_vegana"] = representante["es_vegana"]
            linea["aptitud_vegana"] = representante["aptitud_vegana"]
            linea["es_libre_crueldad"] = representante["es_libre_crueldad"]
            linea["clasificacion_etica"] = representante["clasificacion_etica"]
            linea["precio"] = self.precios.get(linea["clave_linea"])
            linea["busqueda"] = _texto_plano(f"{linea['marca']} {linea['nombre']}")

        self.lineas_alta = sorted(
            (l for l in self.lineas.values() if l["gama"] == "alta"),
            key=lambda l: (l["marca"], l["nombre"]),
        )
        self.lineas_economica = sorted(
            (l for l in self.lineas.values() if l["gama"] == "economica"),
            key=lambda l: (l["marca"], l["nombre"]),
        )
        self.linea_de_formula = {
            f: self.catalogo[f]["clave_linea"] for f in self.orden_formulas
        }

    # ------------------------------------------------------------------
    # Precio y ahorro
    # ------------------------------------------------------------------
    def precio_de(self, id_formula: str) -> dict[str, Any] | None:
        registro = self.catalogo.get(id_formula)
        return registro["precio"] if registro else None

    def ahorro(self, id_lujo: str, id_dupe: str) -> dict[str, Any] | None:
        """Diferencia entre los precios de referencia de las dos líneas comerciales."""
        precio_lujo = self.precio_de(id_lujo)
        precio_dupe = self.precio_de(id_dupe)
        if not precio_lujo or not precio_dupe or precio_lujo["referencia"] <= 0:
            return None
        pesos = precio_lujo["referencia"] - precio_dupe["referencia"]
        return {
            "pesos": pesos,
            "proporcion": round(pesos / precio_lujo["referencia"], 4),
            "precio_lujo": precio_lujo["referencia"],
            "precio_dupe": precio_dupe["referencia"],
            "texto": (
                f"Ahorras {_pesos(pesos)} MXN"
                if pesos > 0
                else f"Cuesta {_pesos(abs(pesos))} MXN más"
            ),
            "favorable": pesos > 0,
            "estimado": not (precio_lujo["es_observado"] and precio_dupe["es_observado"]),
        }

    def cobertura_precio(self) -> dict[str, int]:
        conteo: dict[str, int] = {}
        for precio in self.precios.values():
            conteo[precio["nivel_evidencia"]] = conteo.get(precio["nivel_evidencia"], 0) + 1
        return conteo

    # ------------------------------------------------------------------
    # Consultas de catálogo
    # ------------------------------------------------------------------
    def meta(self) -> dict[str, Any]:
        formatos: dict[str, int] = {}
        efectos: dict[str, int] = {}
        for registro in self.catalogo.values():
            formatos[registro["formato"]] = formatos.get(registro["formato"], 0) + 1
            for efecto in registro["efectos"]:
                efectos[efecto] = efectos.get(efecto, 0) + 1

        referencias = [p["referencia"] for p in self.precios.values()]

        return {
            "catalogo": {
                "formulas": len(self.orden_formulas),
                "lineas_comerciales": len(self.lineas),
                "formulas_alta": len(self.ids_alta),
                "formulas_economica": len(self.ids_economica),
                "lineas_alta": len(self.lineas_alta),
                "lineas_economica": len(self.lineas_economica),
                "marcas": len({r["marca"] for r in self.catalogo.values()}),
                "ingredientes_distintos": len(self.vocabulario),
            },
            "modelo": {
                "funcion_similitud": self.configuracion["modelo"]["funcion_similitud"],
                "alfa_ingredientes": self.alfa,
                "rango_maximo": self.rango_maximo,
                "decaimiento": self.configuracion["modelo"]["decaimiento"],
                "k_negocio": self.k_negocio,
                "tolerancia_empate": self.tolerancia_empate,
                "variables_perfil": len(self.variables_perfil),
            },
            "escala": {
                "percentil_nivel_1": self.percentil_nivel_1,
                "separacion_nivel_1": self.separacion_nivel_1,
                "percentil_nivel_2": self.percentil_nivel_2,
                "criterio_separacion": self.configuracion["escala"]["criterio_separacion"],
                "criterio_percentil": self.configuracion["escala"]["criterio_percentil"],
            },
            "etiquetas": self.configuracion["etiquetas"],
            "arquetipos": {
                **self.configuracion["arquetipos"],
                "nombres_llanos": {str(k): v for k, v in self.nombres_arquetipo_llanos.items()},
            },
            "desempeno": self.configuracion["desempeno_declarado"],
            "avisos": self.configuracion["avisos"],
            "precios": {
                **self.parametros_precio,
                "lineas_con_precio": len(self.precios),
                "cobertura": self.cobertura_precio(),
                "minimo_catalogo": min(referencias) if referencias else None,
                "maximo_catalogo": max(referencias) if referencias else None,
            },
            "filtros": {
                "formatos": sorted(formatos, key=lambda f: -formatos[f]),
                "nombres_formato": NOMBRE_FORMATO,
                "conteo_formatos": formatos,
                "efectos": sorted(efectos, key=lambda e: -efectos[e]),
                "conteo_efectos": efectos,
                "aptitud_vegana": sorted({r["aptitud_vegana"] for r in self.catalogo.values()}),
                "clasificacion_etica": sorted(
                    {r["clasificacion_etica"] for r in self.catalogo.values()}
                ),
                "ordenes": list(ORDENES_DISPONIBLES),
            },
        }

    def marcas(self) -> list[dict[str, Any]]:
        agrupado: dict[str, dict[str, Any]] = {}
        for registro in self.catalogo.values():
            marca = agrupado.setdefault(
                registro["marca"],
                {
                    "marca": registro["marca"],
                    "marca_catalogo": registro["marca_catalogo"],
                    "gama": registro["gama"],
                    "formulas": 0,
                    "lineas": set(),
                    "veganas": 0,
                    "formatos": {},
                    "clasificacion_etica": registro["clasificacion_etica"],
                    "es_libre_crueldad": registro["es_libre_crueldad"],
                },
            )
            marca["formulas"] += 1
            marca["lineas"].add(registro["clave_linea"])
            marca["veganas"] += int(registro["es_vegana"])
            marca["formatos"][registro["formato"]] = (
                marca["formatos"].get(registro["formato"], 0) + 1
            )

        salida = []
        for marca in agrupado.values():
            claves = marca["lineas"]
            referencias = sorted(
                self.precios[c]["referencia"] for c in claves if c in self.precios
            )
            marca["lineas"] = len(claves)
            marca["proporcion_vegana"] = round(marca["veganas"] / marca["formulas"], 4)
            marca["formatos"] = sorted(marca["formatos"], key=lambda f: -marca["formatos"][f])
            marca["nombres_formato"] = [NOMBRE_FORMATO.get(f, f) for f in marca["formatos"]]
            if referencias:
                medio = len(referencias) // 2
                marca["precio_mediano"] = (
                    referencias[medio]
                    if len(referencias) % 2
                    else int(round((referencias[medio - 1] + referencias[medio]) / 2))
                )
                marca["precio_minimo"] = referencias[0]
                marca["precio_maximo"] = referencias[-1]
            else:
                marca["precio_mediano"] = None
                marca["precio_minimo"] = None
                marca["precio_maximo"] = None
            salida.append(marca)
        return sorted(salida, key=lambda m: _texto_plano(m["marca"]))

    def listar_lineas(
        self,
        gama: str | None = None,
        marca: str | None = None,
        formato: str | None = None,
        efecto: str | None = None,
        etico: bool = False,
        vegano: bool = False,
        busqueda: str | None = None,
        precio_desde: int | None = None,
        precio_hasta: int | None = None,
        orden: str = "marca",
        pagina: int = 1,
        por_pagina: int = 24,
    ) -> dict[str, Any]:
        candidatas = list(self.lineas.values())

        if gama:
            candidatas = [l for l in candidatas if l["gama"] == gama]
        if marca:
            clave = _texto_plano(marca)
            candidatas = [l for l in candidatas if _texto_plano(l["marca"]) == clave]
        if formato:
            candidatas = [l for l in candidatas if formato in l["formatos"]]
        if efecto:
            candidatas = [l for l in candidatas if efecto in l["efectos"]]
        if etico:
            candidatas = [l for l in candidatas if l["es_libre_crueldad"]]
        if vegano:
            candidatas = [l for l in candidatas if l["es_vegana"]]
        if busqueda:
            termino = _texto_plano(busqueda)
            candidatas = [l for l in candidatas if termino in l["busqueda"]]
        if precio_desde is not None:
            candidatas = [
                l for l in candidatas if l["precio"] and l["precio"]["referencia"] >= precio_desde
            ]
        if precio_hasta is not None:
            candidatas = [
                l for l in candidatas if l["precio"] and l["precio"]["referencia"] <= precio_hasta
            ]

        sin_precio = max(p["referencia"] for p in self.precios.values()) + 1 if self.precios else 0
        claves_orden = {
            "marca": lambda l: (_texto_plano(l["marca"]), _texto_plano(l["nombre"])),
            "nombre": lambda l: (_texto_plano(l["nombre"]), _texto_plano(l["marca"])),
            "precio-asc": lambda l: (
                l["precio"]["referencia"] if l["precio"] else sin_precio,
                _texto_plano(l["marca"]),
            ),
            "precio-desc": lambda l: (
                -(l["precio"]["referencia"] if l["precio"] else 0),
                _texto_plano(l["marca"]),
            ),
        }
        candidatas.sort(key=claves_orden.get(orden, claves_orden["marca"]))

        total = len(candidatas)
        inicio = max(0, (pagina - 1) * por_pagina)
        pagina_actual = candidatas[inicio : inicio + por_pagina]

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "orden": orden if orden in ORDENES_DISPONIBLES else "marca",
            "paginas": max(1, math.ceil(total / por_pagina)) if por_pagina else 1,
            "resultados": [self._resumen_linea(l) for l in pagina_actual],
        }

    def _resumen_linea(self, linea: dict[str, Any]) -> dict[str, Any]:
        representante = self.catalogo[linea["id_representante"]]
        return {
            "clave_linea": linea["clave_linea"],
            "id_representante": linea["id_representante"],
            "arquetipo": representante["arquetipo"],
            "nombre_arquetipo": representante["nombre_arquetipo"],
            "tipo_formula": representante["tipo_formula"],
            "n_ingredientes_base": representante["n_ingredientes_base"],
            "marca": linea["marca"],
            "nombre": linea["nombre"],
            "gama": linea["gama"],
            "formato": linea["formato"],
            "formato_nombre": NOMBRE_FORMATO.get(linea["formato"], linea["formato"]),
            "formatos": linea["formatos"],
            "acabados": linea["acabados"],
            "efectos": linea["efectos"],
            "n_formulas": linea["n_formulas"],
            "tonos": linea["tonos"],
            "aptitud_vegana": linea["aptitud_vegana"],
            "es_vegana": linea["es_vegana"],
            "clasificacion_etica": linea["clasificacion_etica"],
            "es_libre_crueldad": linea["es_libre_crueldad"],
            "precio": linea["precio"],
            "consultable": linea["id_representante"] in self.fila_consulta,
        }

    def producto(self, id_formula: str) -> dict[str, Any]:
        registro = self.catalogo.get(id_formula)
        if registro is None:
            raise KeyError(id_formula)

        linea = self.lineas[registro["clave_linea"]]
        ingredientes = self.ingredientes_por_formula[id_formula]
        destacados = [i for i in ingredientes if i["calificacion"] in {"superstar", "goodie"}]
        poco_comunes = [i for i in ingredientes if i["poco_comun"]]

        variantes = [
            {
                "id_formula": otro,
                "tono": self.catalogo[otro]["tono"],
                "acabado": self.catalogo[otro]["acabado"],
                "acabado_declarado": self.catalogo[otro]["acabado_declarado"],
                "calificador_presentacion": self.catalogo[otro]["calificador_presentacion"],
                "es_representante_linea": self.catalogo[otro]["es_representante_linea"],
            }
            for otro in sorted(linea["formulas"])
        ]

        perfil = self.matriz_perfil[self.indice_formula[id_formula]]
        orden_perfil = np.argsort(-perfil)[:8]
        perfil_destacado = [
            {
                "variable": self.variables_perfil[k],
                "nombre": NOMBRE_VARIABLE.get(
                    self.variables_perfil[k], self.variables_perfil[k]
                ),
                "nombre_llano": NOMBRE_LLANO.get(
                    self.variables_perfil[k], self.variables_perfil[k]
                ),
                "valor": round(float(perfil[k]), 4),
            }
            for k in orden_perfil
            if perfil[k] > 0
        ]

        indice_variable = {v: k for k, v in enumerate(self.variables_perfil)}
        perfil_textura = [
            {
                "variable": variable,
                "nombre": NOMBRE_VARIABLE.get(variable, variable),
                "nombre_llano": NOMBRE_LLANO.get(variable, variable),
                "valor": round(float(perfil[indice_variable[variable]]), 4),
            }
            for variable in VARIABLES_TEXTURA
            if variable in indice_variable
        ]

        detalle = dict(registro)
        detalle.pop("busqueda", None)
        detalle.update(
            {
                "linea": self._resumen_linea(linea),
                "variantes": variantes,
                "ingredientes": ingredientes,
                "n_destacados": len(destacados),
                "n_poco_comunes": len(poco_comunes),
                "perfil_destacado": perfil_destacado,
                "perfil_textura": perfil_textura,
                "consultable": id_formula in self.fila_consulta,
            }
        )
        return detalle

    # ------------------------------------------------------------------
    # Recuperación
    # ------------------------------------------------------------------
    def _mascara_candidatas(
        self,
        etico: bool,
        vegano: bool,
        formatos: list[str] | None,
        efectos: list[str] | None,
        precio_hasta: int | None = None,
    ) -> np.ndarray:
        mascara = np.ones(len(self.ids_economica), dtype=bool)
        for j, identificador in enumerate(self.ids_economica):
            registro = self.catalogo[identificador]
            admisible = True
            if etico and not registro["es_libre_crueldad"]:
                admisible = False
            elif vegano and not registro["es_vegana"]:
                admisible = False
            elif formatos and registro["formato"] not in formatos:
                admisible = False
            elif efectos and not set(efectos).intersection(registro["efectos"]):
                admisible = False
            elif precio_hasta is not None and (
                not registro["precio"] or registro["precio"]["referencia"] > precio_hasta
            ):
                admisible = False
            mascara[j] = admisible
        return mascara

    def alternativas(
        self,
        id_formula: str,
        etico: bool = False,
        vegano: bool = False,
        formatos: list[str] | None = None,
        efectos: list[str] | None = None,
        precio_hasta: int | None = None,
        n: int = 5,
        agrupar_por_linea: bool = True,
    ) -> dict[str, Any]:
        if id_formula not in self.fila_consulta:
            raise KeyError(id_formula)

        fila = self.fila_consulta[id_formula]
        mascara = self._mascara_candidatas(etico, vegano, formatos, efectos, precio_hasta)
        universo_filtrado = int(mascara.sum())

        resultados: list[dict[str, Any]] = []
        lineas_vistas: set[str] = set()
        for columna in self.orden_completo[fila]:
            if not mascara[columna]:
                continue
            identificador = self.ids_economica[columna]
            clave = self.linea_de_formula[identificador]
            if agrupar_por_linea and clave in lineas_vistas:
                continue
            lineas_vistas.add(clave)
            resultados.append(self._tarjeta_candidata(id_formula, identificador, fila, columna))
            if len(resultados) >= n:
                break

        consulta = self.catalogo[id_formula]
        return {
            "consulta": {
                "id_formula": id_formula,
                "marca": consulta["marca"],
                "nombre": consulta["nombre"],
                "formato": consulta["formato"],
                "formato_nombre": consulta["formato_nombre"],
                "tono": consulta["tono"],
                "gama": consulta["gama"],
                "precio": consulta["precio"],
            },
            "universo": {
                "completo": len(self.ids_economica),
                "tras_filtros": universo_filtrado,
                "suficiente": universo_filtrado >= self.configuracion["avisos"]["universo_minimo"],
                "minimo_recomendado": self.configuracion["avisos"]["universo_minimo"],
            },
            "filtros": {
                "etico": etico,
                "vegano": vegano,
                "formatos": formatos or [],
                "efectos": efectos or [],
                "precio_hasta": precio_hasta,
            },
            "resultados": resultados,
            "aviso_alcance": self.configuracion["avisos"]["alcance"],
            "aviso_vegano": (
                "El filtro vegano conserva únicamente las fórmulas clasificadas como veganas por "
                "su composición. Las fórmulas cuya aptitud depende del tono quedan fuera porque "
                "la evidencia disponible no permite afirmarlo para todos sus tonos."
                if vegano
                else None
            ),
        }

    def _tarjeta_candidata(
        self, id_lujo: str, id_dupe: str, fila: int, columna: int
    ) -> dict[str, Any]:
        registro = self.catalogo[id_dupe]
        nivel = int(self.nivel[fila, columna])
        etiqueta = self.etiquetas[nivel]
        linea = self.lineas[registro["clave_linea"]]
        return {
            "id_formula": id_dupe,
            "marca": registro["marca"],
            "nombre": registro["nombre"],
            "tono": registro["tono"],
            "formato": registro["formato"],
            "formato_nombre": registro["formato_nombre"],
            "acabado": registro["acabado"],
            "acabado_declarado": registro["acabado_declarado"],
            "efectos": registro["efectos"],
            "clave_linea": registro["clave_linea"],
            "n_formulas_linea": linea["n_formulas"],
            "aptitud_vegana": registro["aptitud_vegana"],
            "es_vegana": registro["es_vegana"],
            "clasificacion_etica": registro["clasificacion_etica"],
            "es_libre_crueldad": registro["es_libre_crueldad"],
            "arquetipo": registro["arquetipo"],
            "nombre_arquetipo": registro["nombre_arquetipo"],
            "tipo_formula": registro["tipo_formula"],
            "n_ingredientes_base": registro["n_ingredientes_base"],
            "precio": registro["precio"],
            "ahorro": self.ahorro(id_lujo, id_dupe),
            "similitud": round(float(self.similitud[fila, columna]), 6),
            "percentil": round(float(self.percentil[fila, columna]), 2),
            "separacion": round(float(self.separacion[fila, columna]), 3),
            "posicion": int(self.rango[fila, columna]),
            "universo": len(self.ids_economica),
            "nivel": nivel,
            "etiqueta": etiqueta["etiqueta"],
            "descripcion": etiqueta["descripcion"],
            "url_representante": registro["url_representante"],
        }

    def validar(self, id_lujo: str, id_dupe: str) -> dict[str, Any]:
        if id_lujo not in self.fila_consulta:
            raise KeyError(id_lujo)
        if id_dupe not in self.columna_candidata:
            raise KeyError(id_dupe)

        fila = self.fila_consulta[id_lujo]
        columna = self.columna_candidata[id_dupe]
        nivel = int(self.nivel[fila, columna])
        etiqueta = self.etiquetas[nivel]

        mejores: list[dict[str, Any]] = []
        lineas_vistas: set[str] = set()
        for c in self.orden_completo[fila]:
            identificador = self.ids_economica[c]
            clave = self.linea_de_formula[identificador]
            if clave in lineas_vistas:
                continue
            lineas_vistas.add(clave)
            mejores.append(self._tarjeta_candidata(id_lujo, identificador, fila, c))
            if len(mejores) >= self.k_negocio:
                break

        return {
            "lujo": self._referencia(id_lujo),
            "dupe": self._referencia(id_dupe),
            "nivel": nivel,
            "etiqueta": etiqueta["etiqueta"],
            "veredicto": etiqueta["veredicto"],
            "descripcion": etiqueta["descripcion"],
            "ahorro": self.ahorro(id_lujo, id_dupe),
            "similitud": round(float(self.similitud[fila, columna]), 6),
            "percentil": round(float(self.percentil[fila, columna]), 2),
            "separacion": round(float(self.separacion[fila, columna]), 3),
            "posicion": int(self.rango[fila, columna]),
            "universo": len(self.ids_economica),
            "mejores_del_catalogo": mejores,
            "explicacion": self.explicar(id_lujo, id_dupe),
            "aviso_alcance": self.configuracion["avisos"]["alcance"],
        }

    def _referencia(self, id_formula: str) -> dict[str, Any]:
        registro = self.catalogo[id_formula]
        return {
            "id_formula": id_formula,
            "marca": registro["marca"],
            "nombre": registro["nombre"],
            "tono": registro["tono"],
            "formato": registro["formato"],
            "formato_nombre": registro["formato_nombre"],
            "acabado": registro["acabado"],
            "acabado_declarado": registro["acabado_declarado"],
            "efectos": registro["efectos"],
            "gama": registro["gama"],
            "clasificacion_etica": registro["clasificacion_etica"],
            "es_libre_crueldad": registro["es_libre_crueldad"],
            "aptitud_vegana": registro["aptitud_vegana"],
            "es_vegana": registro["es_vegana"],
            "arquetipo": registro["arquetipo"],
            "nombre_arquetipo": registro["nombre_arquetipo"],
            "tipo_formula": registro["tipo_formula"],
            "n_ingredientes_base": registro["n_ingredientes_base"],
            "precio": registro["precio"],
            "url_representante": registro["url_representante"],
        }

    # ------------------------------------------------------------------
    # Explicación
    # ------------------------------------------------------------------
    def _ficha_ingrediente(self, clave: str, rango_lujo: int | None, rango_dupe: int | None) -> dict[str, Any]:
        return {
            "ingrediente": self.nombre_ingrediente.get(clave, clave),
            "clave": clave,
            "rango_lujo": rango_lujo,
            "rango_dupe": rango_dupe,
            "formulas_del_catalogo": self.soporte_ingrediente.get(clave, 0),
            "poco_comun": self.poco_comun.get(clave, False),
        }

    def explicar(
        self, id_lujo: str, id_dupe: str, n_ingredientes: int = 8, n_variables: int = 5
    ) -> dict[str, Any]:
        posicion_lujo = self.indice_formula[id_lujo]
        posicion_dupe = self.indice_formula[id_dupe]

        u = self.matriz_base[posicion_lujo]
        v = self.matriz_base[posicion_dupe]
        norma_ingredientes = np.linalg.norm(u) * np.linalg.norm(v)
        aporte_ingredientes = (
            (u * v) / norma_ingredientes if norma_ingredientes > 0 else np.zeros_like(u)
        )
        coseno_ingredientes = float(aporte_ingredientes.sum())

        p = self.matriz_perfil[posicion_lujo]
        q = self.matriz_perfil[posicion_dupe]
        norma_perfil = np.linalg.norm(p) * np.linalg.norm(q)
        aporte_perfil = (p * q) / norma_perfil if norma_perfil > 0 else np.zeros_like(p)
        coseno_perfil = float(aporte_perfil.sum())

        similitud = self.alfa * coseno_ingredientes + (1.0 - self.alfa) * coseno_perfil

        rangos_lujo = {
            i["ingrediente"]: i["rango_base"] for i in self.ingredientes_por_formula[id_lujo]
        }
        rangos_dupe = {
            i["ingrediente"]: i["rango_base"] for i in self.ingredientes_por_formula[id_dupe]
        }
        en_lujo = self.claves_en_corte[id_lujo]
        en_dupe = self.claves_en_corte[id_dupe]

        compartidos = [
            self._ficha_ingrediente(clave, rangos_lujo.get(clave), rangos_dupe.get(clave))
            for clave in sorted(en_lujo & en_dupe)
        ]
        for registro in compartidos:
            registro["rango_promedio"] = (registro["rango_lujo"] + registro["rango_dupe"]) / 2.0
        compartidos.sort(key=lambda r: (r["rango_promedio"], r["formulas_del_catalogo"]))

        solo_lujo = [
            self._ficha_ingrediente(clave, rangos_lujo.get(clave), None)
            for clave in sorted(en_lujo - en_dupe, key=lambda c: rangos_lujo.get(c, 99))
        ]
        solo_dupe = [
            self._ficha_ingrediente(clave, None, rangos_dupe.get(clave))
            for clave in sorted(en_dupe - en_lujo, key=lambda c: rangos_dupe.get(c, 99))
        ]

        perfil_ordenado = [
            {
                "variable": self.variables_perfil[k],
                "nombre": NOMBRE_VARIABLE.get(
                    self.variables_perfil[k], self.variables_perfil[k]
                ),
                "nombre_llano": NOMBRE_LLANO.get(
                    self.variables_perfil[k], self.variables_perfil[k]
                ),
                "valor_lujo": round(float(p[k]), 4),
                "valor_dupe": round(float(q[k]), 4),
                "aporte": round(float(aporte_perfil[k]), 4),
                "brecha": round(abs(float(p[k]) - float(q[k])), 4),
            }
            for k in np.argsort(-aporte_perfil)
        ]
        perfil = perfil_ordenado[:n_variables]
        contrastes = sorted(perfil_ordenado, key=lambda r: -r["brecha"])[:n_variables]

        destacados = [r["ingrediente"] for r in compartidos[:n_ingredientes]]
        distintivos = [r["ingrediente"] for r in compartidos if r["poco_comun"]][:3]
        familias = [r["nombre_llano"] for r in perfil[:2]]

        n_compartidos = len(compartidos)
        if n_compartidos == 0:
            encabezado = "No comparten ningún ingrediente de la base química visible para el modelo."
        elif n_compartidos == 1:
            encabezado = (
                f"Comparten un solo ingrediente de la base química visible para el modelo, "
                f"{destacados[0]}."
            )
        else:
            encabezado = (
                f"Comparten {n_compartidos} ingredientes de la base química visible para el "
                f"modelo, encabezados por {_enumerar(destacados[:3])}."
            )

        resumen = (
            encabezado
            + (
                f" Coincidencias poco comunes en el catálogo: {_enumerar(distintivos)}."
                if distintivos
                else ""
            )
            + (
                " La arquitectura funcional coincide sobre todo en "
                + _enumerar([_minuscula_inicial(f) for f in familias])
                + "."
                if familias
                else ""
            )
        )

        if not solo_lujo and not solo_dupe:
            resumen_diferencias = (
                "Dentro del corte que el modelo compara, las dos fórmulas declaran exactamente "
                "los mismos ingredientes."
            )
        else:
            partes = []
            if solo_lujo:
                partes.append(
                    f"el de gama alta declara {len(solo_lujo)} que la alternativa no tiene"
                    + (
                        f", encabezados por {_enumerar([r['ingrediente'] for r in solo_lujo[:3]])}"
                        if solo_lujo
                        else ""
                    )
                )
            if solo_dupe:
                partes.append(
                    f"la alternativa declara {len(solo_dupe)} que el de gama alta no tiene"
                    + (
                        f", encabezados por {_enumerar([r['ingrediente'] for r in solo_dupe[:3]])}"
                        if solo_dupe
                        else ""
                    )
                )
            resumen_diferencias = "De los ingredientes que el sistema compara, " + " y ".join(partes) + "."
            if contrastes and contrastes[0]["brecha"] > 0:
                resumen_diferencias += (
                    " La mayor diferencia de construcción está en "
                    + _minuscula_inicial(contrastes[0]["nombre_llano"])
                    + "."
                )

        return {
            "similitud": round(similitud, 6),
            "coseno_ingredientes": round(coseno_ingredientes, 6),
            "coseno_perfil": round(coseno_perfil, 6),
            "aporte_relativo_ingredientes": round(
                self.alfa * coseno_ingredientes / similitud, 4
            )
            if similitud
            else 0.0,
            "aporte_relativo_perfil": round(
                (1.0 - self.alfa) * coseno_perfil / similitud, 4
            )
            if similitud
            else 0.0,
            "n_ingredientes_compartidos": n_compartidos,
            "n_solo_lujo": len(solo_lujo),
            "n_solo_dupe": len(solo_dupe),
            "ingredientes_compartidos": compartidos[:n_ingredientes],
            "ingredientes_compartidos_total": compartidos,
            "solo_en_lujo": solo_lujo[:n_ingredientes],
            "solo_en_dupe": solo_dupe[:n_ingredientes],
            "perfil_funcional": perfil,
            "contrastes_funcionales": contrastes,
            "resumen": resumen,
            "resumen_diferencias": resumen_diferencias,
        }

    # ------------------------------------------------------------------
    # Pares documentados
    # ------------------------------------------------------------------
    def cargar_pares_documentados(self, ruta: Path | str) -> list[dict[str, Any]]:
        filas = _leer_csv(Path(ruta))
        salida = []
        for fila in filas:
            id_lujo = fila["id_formula_lujo"]
            id_dupe = fila["id_formula_dupe"]
            if id_lujo not in self.fila_consulta or id_dupe not in self.columna_candidata:
                continue
            f, c = self.fila_consulta[id_lujo], self.columna_candidata[id_dupe]
            nivel = int(self.nivel[f, c])
            salida.append(
                {
                    "id_par": fila["id_par"],
                    "lujo": self._referencia(id_lujo),
                    "dupe": self._referencia(id_dupe),
                    "origen": fila.get("origen", ""),
                    "nivel_evidencia": fila.get("nivel_fuerza_evidencia", ""),
                    "n_fuentes": int(float(fila.get("n_fuentes_total") or 0)),
                    "formato_coincide": _booleano(fila.get("formato_coincide", "")),
                    "ahorro": self.ahorro(id_lujo, id_dupe),
                    "similitud": round(float(self.similitud[f, c]), 6),
                    "percentil": round(float(self.percentil[f, c]), 2),
                    "posicion": int(self.rango[f, c]),
                    "nivel": nivel,
                    "etiqueta": self.etiquetas[nivel]["etiqueta"],
                }
            )
        return salida


@lru_cache(maxsize=1)
def obtener_motor() -> MotorSameSame:
    return MotorSameSame()
