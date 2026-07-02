package employees

import (
	"certification-system/utils"
	"errors"
	"fmt"
	"mime/multipart"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type EmployeeService interface {
	GetAllEmp(param utils.PaginationParam) ([]Employee, *utils.Pagination, error)
	GetUserByID(id uint) (Employee, error)
	GetUserByNIK(nik string) (Employee, error)
	CreateEmp(emp *Employee) error
	UpdateEmp(emp *Employee) error
	DeleteEmp(id uint) error
	ImportFromExcel(file multipart.File) (int, []string, error)
	ExportToExcel() (*excelize.File, error)
	DownloadTemplate() (*excelize.File, error)
}

type employeeService struct {
	repo EmployeeRepository
}

func NewEmployeeService(repo EmployeeRepository) EmployeeService {
	return &employeeService{repo: repo}
}

func (s *employeeService) GetAllEmp(param utils.PaginationParam) ([]Employee, *utils.Pagination, error) {
	return s.repo.FindAll(param)
}

func (s *employeeService) GetUserByID(id uint) (Employee, error) {
	return s.repo.FindByID(id)
}

func (s *employeeService) GetUserByNIK(nik string) (Employee, error) {
	return s.repo.FindByNIK(nik)
}

func (s *employeeService) CreateEmp(emp *Employee) error {
	return s.repo.Create(emp)
}

func (s *employeeService) UpdateEmp(emp *Employee) error {
	return s.repo.Update(emp)
}

func (s *employeeService) DeleteEmp(id uint) error {
	return s.repo.Delete(id)
}

func (s *employeeService) ImportFromExcel(file multipart.File) (int, []string, error) {
	f, err := excelize.OpenReader(file)
	if err != nil {
		return 0, nil, errors.New("gagal membaca file")
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	if sheetName == "" {
		return 0, nil, errors.New("sheet tidak ditemukan")
	}

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return 0, nil, errors.New("gagal membaca data sheet")
	}

	if len(rows) < 2 {
		return 0, nil, errors.New("File excel kosong atau hanya berisi header")
	}

	successCount := 0
	errorsList := []string{}

	for i := 3; i < len(rows); i++ {
		row := rows[i]
		rowNum := i + 1

		if isEmptyRow(row) {
			continue
		}

		if len(row) < 4 {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: data tidak lengkap", rowNum))
			continue
		}

		nik := strings.TrimSpace(row[0])
		name := strings.TrimSpace(row[1])
		dept := strings.TrimSpace(row[2])
		typeEmp := strings.TrimSpace(row[3])

		// Skip baris header (jika user tidak menghapus header)
		if isHeaderRow(nik, name) {
			continue
		}

		if nik == "" || name == "" {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: NIK atau nama kosong", rowNum))
			continue
		}

		existing, err := s.repo.FindByNIK(nik)
		if err == nil {
			// Update
			existing.Name = name
			existing.Department = dept
			existing.TypeEmployee = typeEmp
			if err := s.repo.Update(&existing); err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d (NIK %s): gagal update - %v", rowNum, nik, err))
				continue
			}
		} else {
			// Create
			emp := Employee{
				NIK:          nik,
				Name:         name,
				Department:   dept,
				TypeEmployee: typeEmp,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := s.repo.Create(&emp); err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d (NIK %s): gagal insert - %v", rowNum, nik, err))
				continue
			}
		}
		successCount++
	}

	return successCount, errorsList, nil
}
func isEmptyRow(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

// Helper: cek apakah ini header row
func isHeaderRow(nik, name string) bool {
	nikLower := strings.ToLower(strings.TrimSpace(nik))
	nameLower := strings.ToLower(strings.TrimSpace(name))

	// Header yang mungkin
	headers := []string{"nik", "nik *", "id", "id/nik", "username"}
	for _, h := range headers {
		if nikLower == h {
			return true
		}
	}

	// Cek nama header
	nameHeaders := []string{"nama lengkap", "nama lengkap *", "nama", "name"}
	for _, h := range nameHeaders {
		if nameLower == h {
			return true
		}
	}

	return false
}

func (s *employeeService) ExportToExcel() (*excelize.File, error) {
	employees, err := s.repo.FindAllWithoutPagination()
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	sheetName := "Data Karyawan"
	f.SetSheetName("Sheet1", sheetName)

	// Header style
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold:  true,
			Size:  12,
			Color: "#FFFFFF",
		},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"#2563EB"},
			Pattern: 1,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
			Vertical:   "center",
		},
		Border: []excelize.Border{
			{Type: "left", Color: "#D1D5DB", Style: 1},
			{Type: "right", Color: "#D1D5DB", Style: 1},
			{Type: "top", Color: "#D1D5DB", Style: 1},
			{Type: "bottom", Color: "#D1D5DB", Style: 1},
		},
	})

	// Data style
	dataStyle, _ := f.NewStyle(&excelize.Style{
		Border: []excelize.Border{
			{Type: "left", Color: "#D1D5DB", Style: 1},
			{Type: "right", Color: "#D1D5DB", Style: 1},
			{Type: "top", Color: "#D1D5DB", Style: 1},
			{Type: "bottom", Color: "#D1D5DB", Style: 1},
		},
		Alignment: &excelize.Alignment{
			Vertical: "center",
		},
	})

	// Set column widths
	f.SetColWidth(sheetName, "A", "A", 12) // NIK
	f.SetColWidth(sheetName, "B", "B", 30) // Nama
	f.SetColWidth(sheetName, "C", "C", 25) // Department
	f.SetColWidth(sheetName, "D", "D", 20) // Tipe

	// Headers
	headers := []string{"NIK", "Nama Lengkap", "Departemen", "Tipe Karyawan"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	// Data
	for i, emp := range employees {
		row := i + 2
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), emp.NIK)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), emp.Name)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", row), emp.Department)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", row), emp.TypeEmployee)

		// Apply style to data cells
		for col := 1; col <= 4; col++ {
			cell, _ := excelize.CoordinatesToCellName(col, row)
			f.SetCellStyle(sheetName, cell, cell, dataStyle)
		}
	}

	// Set row height
	f.SetRowHeight(sheetName, 1, 25)

	return f, nil
}

func (s *employeeService) DownloadTemplate() (*excelize.File, error) {
	f := excelize.NewFile()
	sheetName := "Template Import"
	f.SetSheetName("Sheet1", sheetName)

	// Style
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 11, Color: "#FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#059669"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	noteStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 9, Color: "#6B7280", Italic: true},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})

	// Title
	f.SetCellValue(sheetName, "A1", "TEMPLATE IMPORT DATA KARYAWAN")
	f.MergeCell(sheetName, "A1", "D1")
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 14, Color: "#1F2937"},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	f.SetCellStyle(sheetName, "A1", "D1", titleStyle)
	f.SetRowHeight(sheetName, 1, 30)

	// Notes
	f.SetCellValue(sheetName, "A2", "Petunjuk: Isi data mulai dari baris 4. Jangan ubah header di baris 3.")
	f.MergeCell(sheetName, "A2", "D2")
	f.SetCellStyle(sheetName, "A2", "D2", noteStyle)

	// Headers
	f.SetColWidth(sheetName, "A", "A", 12)
	f.SetColWidth(sheetName, "B", "B", 30)
	f.SetColWidth(sheetName, "C", "C", 25)
	f.SetColWidth(sheetName, "D", "D", 20)

	headers := []string{"NIK *", "Nama Lengkap *", "Departemen", "Tipe Karyawan"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 3)
		f.SetCellValue(sheetName, cell, h)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	// Example data
	examples := [][]string{
		{"80028", "Rizki Hidayat", "Production", "Direct"},
		{"80029", "Siti Nurhaliza", "Quality Control", "Direct"},
		{"", "", "", ""},
	}
	for i, ex := range examples {
		row := i + 4
		for j, val := range ex {
			cell, _ := excelize.CoordinatesToCellName(j+1, row)
			f.SetCellValue(sheetName, cell, val)
		}
	}

	// Dropdown for Tipe Karyawan
	dv := excelize.NewDataValidation(true)
	dv.Sqref = "D4:D1000"
	dv.SetDropList([]string{"Direct", "Semi-Direct", "In-Direct"})
	f.AddDataValidation(sheetName, dv)

	return f, nil
}
