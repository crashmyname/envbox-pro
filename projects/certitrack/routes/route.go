package routes

import (
	"certification-system/modules/auth"
	"certification-system/modules/certificate"
	"certification-system/modules/employees"
	"certification-system/modules/users"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine) {
	public := r.Group("/api")

	protected := r.Group("/api")
	protected.Use(auth.AuthMiddleware())

	auth.RegisterAuthRoutes(public, protected)
	users.RegisterUserRoutes(protected)
	employees.RegisterEmployeeRoutes(protected)
	certificate.RegisterCertificateRoutes(protected)
}
