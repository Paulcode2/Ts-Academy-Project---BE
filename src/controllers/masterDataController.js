const { asyncHandler, successResponse } = require("../utils");
const service = require("../services/masterDataService");

const handlers = {
  createWarehouse: [
    service.createWarehouse,
    "Warehouse created successfully.",
    201,
  ],
  listWarehouses: [
    service.listWarehouses,
    "Warehouses retrieved successfully.",
  ],
  getWarehouse: [service.getWarehouse, "Warehouse retrieved successfully."],
  updateWarehouse: [service.updateWarehouse, "Warehouse updated successfully."],
  setWarehouseStatus: [
    service.setWarehouseStatus,
    "Warehouse status updated successfully.",
  ],
  createLocation: [
    service.createLocation,
    "Location created successfully.",
    201,
  ],
  listLocations: [service.listLocations, "Locations retrieved successfully."],
  getLocation: [service.getLocation, "Location retrieved successfully."],
  updateLocation: [service.updateLocation, "Location updated successfully."],
  setLocationStatus: [
    service.setLocationStatus,
    "Location status updated successfully.",
  ],
  createCategory: [
    service.createCategory,
    "Category created successfully.",
    201,
  ],
  listCategories: [
    service.listCategories,
    "Categories retrieved successfully.",
  ],
  getCategory: [service.getCategory, "Category retrieved successfully."],
  updateCategory: [service.updateCategory, "Category updated successfully."],
  setCategoryStatus: [
    service.setCategoryStatus,
    "Category status updated successfully.",
  ],
  createProduct: [service.createProduct, "Product created successfully.", 201],
  listProducts: [service.listProducts, "Products retrieved successfully."],
  getProduct: [service.getProduct, "Product retrieved successfully."],
  updateProduct: [service.updateProduct, "Product updated successfully."],
  setProductStatus: [
    service.setProductStatus,
    "Product status updated successfully.",
  ],
};

const createHandler = (operation, message, statusCode = 200) =>
  asyncHandler(async (req, res) => {
    const result = await operation(req);

    if (result?.pagination) {
      return res.status(statusCode).json(result);
    }

    return res.status(statusCode).json(successResponse(message, result));
  });

module.exports = Object.fromEntries(
  Object.entries(handlers).map(([name, [operation, message, statusCode]]) => [
    name,
    createHandler(operation, message, statusCode),
  ]),
);
