import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../db/connection.js";
import { config } from "../config.js";

const router = Router();

// Helper to blacklist a token with its actual expiration time
const blacklistToken = async (token) => {
  if (!token) return;
  try {
    const decoded = jwt.decode(token);
    const expiresAt = decoded && decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours fallback

    await prisma.tokenBlacklist.upsert({
      where: { token },
      update: {},
      create: { token, expiresAt },
    });
  } catch (err) {
    console.error("Failed to blacklist token:", err);
  }
};

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: "Your account has been blocked by an administrator" });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Sign short-lived access token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRY }
    );

    // Sign long-lived refresh token
    const refreshToken = jwt.sign(
      { id: user.id, username: user.username, type: "refresh" },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRY }
    );

    // Calculate access token lifetime in seconds (15m = 900s)
    const expiresIn = 900;

    return res.status(200).json({ token, refreshToken, expiresIn });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    // Check if the refresh token is blacklisted
    const isBlacklisted = await prisma.tokenBlacklist.findUnique({
      where: { token: refreshToken },
    });

    if (isBlacklisted) {
      return res.status(401).json({ error: "Refresh token has been revoked" });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    // Verify it is actually a refresh token
    if (decoded.type !== "refresh") {
      return res.status(400).json({ error: "Invalid token type" });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: "User is blocked" });
    }

    // Rotate refresh token: blacklist the old one
    await blacklistToken(refreshToken);

    // Generate new access and refresh tokens
    const newToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRY }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id, username: user.username, type: "refresh" },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRY }
    );

    const expiresIn = 900;

    return res.status(200).json({
      token: newToken,
      refreshToken: newRefreshToken,
      expiresIn,
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    // Blacklist both tokens
    if (refreshToken) {
      await blacklistToken(refreshToken);
    }
    if (accessToken) {
      await blacklistToken(accessToken);
    }

    return res.status(200).json({ message: "Successfully logged out" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
