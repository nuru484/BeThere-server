export class CustomError extends Error {
  constructor(message, status, layer = "unknown") {
    super(message);
    this.status = status;
    this.layer = layer; 
  }
}

export const errorHandler = (error, req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production";

  console.error({
    message: error.message,
    error,
    stack: !isProduction ? error.stack : undefined,
    body: req.body,
  });

  // Check if the error is an instance of CustomError
  if (error instanceof CustomError) {
    // Return a response with the status and message from the CustomError
    return res.status(error.status).json({ message: error.message });
  }

  // For non-CustomError errors, send a generic 500 internal server error response
  res
    .status(error.status || 500)
    .json(error.message || "Internal Server Error");
};
