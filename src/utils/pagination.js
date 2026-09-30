const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parsePagination = (query = {}) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : DEFAULT_PAGE;
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : DEFAULT_LIMIT;

  return {
    page,
    limit: Math.min(limit, MAX_LIMIT),
  };
};

const buildPaginatedResponse = ({
  message = "Records retrieved successfully",
  data = [],
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  totalItems = 0,
}) => ({
  success: true,
  message,
  data,
  pagination: {
    page,
    limit,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
  },
});

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  buildPaginatedResponse,
};
