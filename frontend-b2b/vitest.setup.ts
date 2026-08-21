/**
 * Fichier exécuté une fois avant chaque fichier de test.
 *
 * jest-dom ajoute à "expect" des assertions spécialisées pour le DOM
 * (toBeInTheDocument, toHaveAttribute, toBeDisabled...). Elles produisent des
 * messages d'échec bien plus lisibles qu'un simple booléen : au lieu de
 * "expected false to be true", on obtient l'élément concerné et ce qui
 * n'allait pas.
 */
import "@testing-library/jest-dom/vitest";
