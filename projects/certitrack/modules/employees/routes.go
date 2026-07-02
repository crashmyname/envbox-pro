package employees

import (
	"certification-system/database"

	"github.com/gin-gonic/gin"
)

func RegisterEmployeeRoutes(r *gin.RouterGroup) {
	repo := NewEmployeeRepository(database.DB)
	service := NewEmployeeService(repo)
	handler := NewEmployeeHandler(service)

	r.GET("/employees", handler.GetAll)
	r.POST("/employees", handler.Create)
	r.GET("/employee/:id", handler.GetByID)
	r.GET("/employee/by/:nik", handler.GetByNIK)
	r.PUT("/employees/:id", handler.Update)
	r.DELETE("/employee/:id", handler.Delete)
	r.GET("/employee/template", handler.DownloadTemplate)
	r.POST("/employee/import", handler.ImportExcel)
	r.GET("/employee/export", handler.ExportExcel)
}
