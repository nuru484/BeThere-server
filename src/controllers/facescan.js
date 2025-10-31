import prisma from "../config/prisma-client.js";

export const addFaceScan = async (req, res, next) => {
  try {
    const { userId, faceScan } = req.body;
    const requestingUserId = req.user.id;

    if (!userId || !faceScan) {
      return res.status(400).json({
        message: "User ID and face scan data are required.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({
        message: `User with ID ${userId} not found.`,
      });
    }

    const isAdmin = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });

    if (
      user.id !== requestingUserId &&
      (!isAdmin || isAdmin.role !== "ADMIN")
    ) {
      return res.status(403).json({
        message: "You are not authorized to add a face scan for this user.",
      });
    }

    if (user.faceScan) {
      return res.status(403).json({
        message:
          "User already has a face scan. Contact an admin to delete the existing face scan before adding a new one.",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { faceScan },
    });

    res.status(200).json({
      message: "Face scan added successfully.",
      data: {
        faceScan: updatedUser.faceScan,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFaceScan = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({
        message: `User with ID ${userId} not found.`,
      });
    }

    const isAdmin = await prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { role: true },
    });

    if (
      user.id !== requestingUserId &&
      (!isAdmin || isAdmin.role !== "ADMIN")
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this user's face scan.",
      });
    }

    if (!user.faceScan) {
      return res.status(404).json({
        message: `No face scan data found for user with ID ${userId}.`,
      });
    }

    res.status(200).json({
      message: "Face scan retrieved successfully.",
      data: {
        faceScan: user.faceScan,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFaceScan = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({
        message: `User with ID ${userId} not found.`,
      });
    }

    if (!user.faceScan) {
      return res.status(404).json({
        message: `No face scan data found for user with ID ${userId}.`,
      });
    }

    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { faceScan: null },
    });

    res.status(200).json({
      message: "Face scan deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
