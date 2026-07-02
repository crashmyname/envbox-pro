package employees

import (
	"certification-system/utils"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type EmployeeHandler struct {
	service EmployeeService
}

func NewEmployeeHandler(service EmployeeService) *EmployeeHandler {
	return &EmployeeHandler{service: service}
}

func (h *EmployeeHandler) GetAll(c *gin.Context) {
	param := utils.GetPaginationParams(c)

	emp, pagination, err := h.service.GetAllEmp(param)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal memuat data",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": emp,
		"meta": pagination,
	})
}

func (h *EmployeeHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ID tidak valid",
		})
		return
	}

	emp, err := h.service.GetUserByID(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Karyawan tidak ditemukan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": emp,
	})
}

func (h *EmployeeHandler) GetByNIK(c *gin.Context) {
	nik := c.Param("nik")
	// if err != nil {
	// 	c.JSON(http.StatusInternalServerError, gin.H{
	// 		"error": "nik invalid",
	// 	})
	// 	return
	// }

	emp, err := h.service.GetUserByNIK(string(nik))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "User tidak ditemukan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": emp,
	})
}

func (h *EmployeeHandler) Create(c *gin.Context) {
	var emp Employee
	if err := c.ShouldBindJSON(&emp); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	if err := h.service.CreateEmp(&emp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal membuat karyawan",
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": emp,
	})
}

func (h *EmployeeHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ID tidak valid",
		})
		return
	}

	existingEmp, err := h.service.GetUserByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "karyawan tidak ditemukan",
		})
		return
	}

	var req UpdateEmployeeDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	if req.NIK != nil {
		existingEmp.NIK = *req.NIK
	}
	if req.Name != nil {
		existingEmp.Name = *req.Name
	}
	if req.Department != nil {
		existingEmp.Department = *req.Department
	}
	if req.TypeEmployee != nil {
		existingEmp.TypeEmployee = *req.TypeEmployee
	}

	if err := h.service.UpdateEmp(&existingEmp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal update karyawan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": existingEmp,
	})
}

func (h *EmployeeHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ID tidak valid",
		})
		return
	}

	if err := h.service.DeleteEmp(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal menghapus karyawan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "karyawan berhasil dihapus",
	})
}

func (h *EmployeeHandler) ImportExcel(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File tidak ditemukan. Gunakan key 'file'",
		})
		return
	}
	defer file.Close()

	// Validasi ekstensi
	ext := header.Filename[len(header.Filename)-4:]
	if ext != "xlsx" && ext != ".xls" && ext != "xlsm" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Format file tidak didukung. Gunakan .xlsx",
		})
		return
	}

	successCount, errorsList, err := h.service.ImportFromExcel(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       fmt.Sprintf("Import selesai: %d data berhasil", successCount),
		"success_count": successCount,
		"error_count":   len(errorsList),
		"errors":        errorsList,
	})
}

// GET /api/employees/export
func (h *EmployeeHandler) ExportExcel(c *gin.Context) {
	f, err := h.service.ExportToExcel()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal mengexport data",
		})
		return
	}

	filename := fmt.Sprintf("Data_Karyawan_%s.xlsx", time.Now().Format("20060102"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Transfer-Encoding", "binary")

	f.Write(c.Writer)
}

// GET /api/employees/template
func (h *EmployeeHandler) DownloadTemplate(c *gin.Context) {
	f, err := h.service.DownloadTemplate()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal membuat template",
		})
		return
	}

	filename := "Template_Import_Karyawan.xlsx"
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	f.Write(c.Writer)
}
