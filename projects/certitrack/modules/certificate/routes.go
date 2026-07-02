package certificate

import (
	"certification-system/database"

	"github.com/gin-gonic/gin"
)

func RegisterCertificateRoutes(r *gin.RouterGroup) {
	certRoutes := r.Group("/certificates")

	repo := NewCertificateRepository(database.DB)
	service := NewCertificateService(repo)
	handler := NewCertificateHandler(service)

	certRoutes.GET("", handler.GetAll)
	certRoutes.GET("/status/:status", handler.GetByStatus)
	certRoutes.GET("/nik/:nik", handler.GetByNIK)
	certRoutes.POST("", handler.Create)
	certRoutes.PUT("/:id", handler.Update)
	certRoutes.PUT("/nik/:nik", handler.UpdateByNIK)
	certRoutes.DELETE("/:id", handler.Delete)
}
