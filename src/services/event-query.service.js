// src/services/event-query.service.js
//
// Event reads: single fetch and the filtered list. Both go through
// findFirst/findMany so the soft-delete scope hides deleted events.
import { prisma } from "../config/prisma-client.js";
import { NotFoundError } from "../middleware/error-handler.js";

/** Single event with its location; soft-deleted events read as absent. */
export async function getEventById(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    include: {
      location: true,
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  return event;
}

/** Paginated event list with search, type, and location filters. */
export async function listEvents({ skip, limit, search, type, location }) {
  const whereClause = {};

  if (search) {
    whereClause.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { type: { contains: search, mode: "insensitive" } },
      { location: { city: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (type) {
    whereClause.type = type;
  }

  if (location) {
    whereClause.location = {
      OR: [
        { name: { contains: location, mode: "insensitive" } },
        { city: { contains: location, mode: "insensitive" } },
        { country: { contains: location, mode: "insensitive" } },
      ],
    };
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        location: true,
      },
    }),
    prisma.event.count({ where: whereClause }),
  ]);

  return { events, total };
}
