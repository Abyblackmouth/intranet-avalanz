# ----------------------------------------------------------------------
# Pruebas del mean pooling con mascara y la normalizacion L2
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import numpy as np

from app.adapters.embedding_math import mean_pool_normalize


# ----------------------------------------------------------------------
# El relleno (mascara 0) no participa en el promedio
# ----------------------------------------------------------------------
def test_padding_is_ignored():
    hidden = np.array([[[1.0, 0.0], [3.0, 0.0], [100.0, 100.0]]])
    mask = np.array([[1, 1, 0]])
    result = mean_pool_normalize(hidden, mask)
    assert np.allclose(result, [[1.0, 0.0]])


# ----------------------------------------------------------------------
# Cada vector resultante tiene norma 1
# ----------------------------------------------------------------------
def test_vectors_are_unit_length():
    rng = np.random.default_rng(0)
    result = mean_pool_normalize(rng.normal(size=(4, 6, 8)), np.ones((4, 6)))
    assert np.allclose(np.linalg.norm(result, axis=1), 1.0)


# ----------------------------------------------------------------------
# Con norma 1, el producto punto es la similitud coseno
# ----------------------------------------------------------------------
def test_dot_product_is_cosine():
    a = mean_pool_normalize(np.array([[[0.6, 0.8, 0.0]]]), np.ones((1, 1)))[0]
    b = mean_pool_normalize(np.array([[[0.8, 0.6, 0.0]]]), np.ones((1, 1)))[0]
    assert abs(float(a @ b) - 0.96) < 1e-6
