package users

import (
	"certification-system/database"

	"github.com/gin-gonic/gin"
)

func RegisterUserRoutes(r *gin.RouterGroup) {
	// Setup Dependency Injection
	repo := NewUserRepository(database.DB)
	service := NewUserService(repo)
	handler := NewUserHandler(service)

	// Register routes
	r.GET("/test", handler.TestIndex)
	r.GET("/users", handler.GetAll)
	r.GET("/users/:id", handler.GetById)
	r.POST("/users", handler.Create)
	r.PUT("/users/:id", handler.Update)
	r.DELETE("/users/:id", handler.Delete)
}
