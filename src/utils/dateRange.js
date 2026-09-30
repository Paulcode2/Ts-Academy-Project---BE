const validateDateRange = ({ startDate, endDate }) => {
  const parsedStartDate = startDate ? new Date(startDate) : undefined;
  const parsedEndDate = endDate ? new Date(endDate) : undefined;

  if (startDate && Number.isNaN(parsedStartDate.getTime())) {
    throw new Error("Invalid startDate value.");
  }

  if (endDate && Number.isNaN(parsedEndDate.getTime())) {
    throw new Error("Invalid endDate value.");
  }

  if (parsedStartDate && parsedEndDate && parsedEndDate < parsedStartDate) {
    throw new Error("End date must be after start date.");
  }

  return {
    startDate: parsedStartDate,
    endDate: parsedEndDate,
  };
};

module.exports = {
  validateDateRange,
};
