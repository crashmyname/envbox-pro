package auth

import (
	"certification-system/database"
	"certification-system/modules/users"

	"github.com/gin-gonic/gin"
)

func RegisterAuthRoutes(public, protected *gin.RouterGroup) {

	userRepo := users.NewUserRepository(database.DB)
	userService := users.NewUserService(userRepo)
	authService := NewAuthService(userService)
	authHandler := NewAuthHandler(authService)

	// Auth routes
	public.POST("/auth/login", authHandler.Login)
	public.POST("/auth/register", authHandler.Register)

	protected.GET("/auth/me", authHandler.Me)
	protected.POST("/auth/logout", authHandler.Logout)
}
