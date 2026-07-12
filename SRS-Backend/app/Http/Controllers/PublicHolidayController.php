<?php

namespace App\Http\Controllers;

use App\Models\PublicHoliday;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PublicHolidayController extends Controller
{
    public function index(Request $request)
    {
        $query = PublicHoliday::query();

        if ($request->filled('start_date')) {
            $query->whereDate('date', '>=', $request->input('start_date'));
        }
        if ($request->filled('end_date')) {
            $query->whereDate('date', '<=', $request->input('end_date'));
        }

        $holidays = $query->orderBy('date')->get();

        return response()->json([
            'success' => true,
            'data'    => $holidays,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'date'     => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:date',
            'name_en'  => 'required|string|max:255',
            'name_ar'  => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $holiday = PublicHoliday::create($validator->validated());

        return response()->json([
            'success' => true,
            'data'    => $holiday,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $holiday = PublicHoliday::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'date'     => 'sometimes|date',
            'end_date' => 'nullable|date|after_or_equal:date',
            'name_en'  => 'sometimes|string|max:255',
            'name_ar'  => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        $holiday->update($validator->validated());

        return response()->json([
            'success' => true,
            'data'    => $holiday,
        ]);
    }

    public function destroy($id)
    {
        $holiday = PublicHoliday::findOrFail($id);
        $holiday->delete();

        return response()->json(['success' => true]);
    }
}
