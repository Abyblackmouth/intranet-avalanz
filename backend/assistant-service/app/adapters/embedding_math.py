# ----------------------------------------------------------------------
# Matematica de los embeddings
# Convierte la salida de un modelo tipo BERT (un vector por token) en un
# solo vector por texto. Solo depende de numpy, asi que se prueba sin
# cargar ningun modelo.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import numpy as np


# ----------------------------------------------------------------------
# Mean pooling con mascara y normalizacion L2
# Promedia los vectores de los tokens reales (la mascara excluye el
# relleno) y deja el resultado con norma 1, de modo que el producto
# punto entre dos vectores sea su similitud coseno. Es el pooling con
# el que se entrenaron los modelos e5.
#   hidden: (lote, tokens, dimensiones)   mask: (lote, tokens)
# ----------------------------------------------------------------------
def mean_pool_normalize(hidden: np.ndarray, mask: np.ndarray) -> np.ndarray:
    weights = mask[..., None].astype(np.float32)
    summed = (hidden * weights).sum(axis=1)
    counts = np.clip(weights.sum(axis=1), 1e-9, None)
    pooled = summed / counts
    norms = np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12, None)
    return pooled / norms
