const express = require('express');
const router = express.Router();

// Comprehensive carrier forwarding codes database
const CARRIER_CODES = {
    'att': {
        name: 'AT&T',
        conditional: {
            busy: '*67*{rachel_number}#',
            no_answer: '*61*{rachel_number}#',
            unreachable: '*62*{rachel_number}#',
            unconditional: '*21*{rachel_number}#'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy: '##67#',
            no_answer: '##61#',
            unreachable: '##62#',
            all: '##21#'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'verizon': {
        name: 'Verizon',
        conditional: {
            busy_no_answer: '*71{rachel_number}',
            unconditional: '*72{rachel_number}'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            all: '*73'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'tmobile': {
        name: 'T-Mobile',
        conditional: {
            busy: '**67*{rachel_number}#',
            no_answer: '**61*{rachel_number}#',
            unreachable: '**62*{rachel_number}#',
            unconditional: '**21*{rachel_number}#'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy: '##67#',
            no_answer: '##61#',
            unreachable: '##62#',
            all: '##21#'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'sprint': {
        name: 'Sprint/T-Mobile',
        conditional: {
            busy_no_answer: '*28{rachel_number}',
            busy_only: '*74{rachel_number}',
            no_answer_only: '*73{rachel_number}',
            unconditional: '*72{rachel_number}'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy_no_answer: '*38',
            all: '*73'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'uscellular': {
        name: 'US Cellular',
        conditional: {
            busy_no_answer: '*90*1{rachel_number}',
            no_answer_only: '*92*1{rachel_number}',
            unconditional: '*72*1{rachel_number}'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy: '*900',
            no_answer: '*920',
            all: '*720'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'boost': {
        name: 'Boost Mobile',
        conditional: {
            unconditional: '*72{rachel_number}',
            note: 'Conditional forwarding limited on Boost'
        },
        deactivate: {
            all: '*73'
        },
        recommended: 'unconditional',
        description: 'Limited to unconditional forwarding only'
    },
    
    'metro': {
        name: 'Metro by T-Mobile',
        conditional: {
            busy: '**67*{rachel_number}#',
            no_answer: '**61*{rachel_number}#',
            unconditional: '**21*{rachel_number}#'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy: '##67#',
            no_answer: '##61#',
            all: '##21#'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'visible': {
        name: 'Visible (Verizon)',
        conditional: {
            busy_no_answer: '*71{rachel_number}',
            unconditional: '*72{rachel_number}'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            all: '*73'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    },
    
    'cricketwireless': {
        name: 'Cricket Wireless',
        conditional: {
            busy: '*67*{rachel_number}#',
            no_answer: '*61*{rachel_number}#',
            unconditional: '*21*{rachel_number}#'  // IMMEDIATE forward ALL calls
        },
        deactivate: {
            busy: '##67#',
            no_answer: '##61#',
            all: '##21#'
        },
        recommended: 'unconditional',  // Changed to immediate forward
        description: 'Forwards ALL calls immediately to Rachel AI'
    }
};

// GET /api/call-forwarding/carriers
router.get('/carriers', (req, res) => {
    const carrierList = Object.keys(CARRIER_CODES).map(carrier => ({
        code: carrier,
        name: CARRIER_CODES[carrier].name,
        description: CARRIER_CODES[carrier].description
    }));
    
    res.json({
        success: true,
        carriers: carrierList,
        count: carrierList.length
    });
});

// GET /api/call-forwarding/setup/:carrier/:client_id - Multi-tenant without auth (for testing)
router.get('/setup/:carrier/:client_id', async (req, res) => {
    try {
        const { carrier, client_id } = req.params;
        
        if (!CARRIER_CODES[carrier]) {
            return res.status(400).json({
                success: false,
                error: 'Carrier not supported',
                supported_carriers: Object.keys(CARRIER_CODES)
            });
        }
        
        const { sequelize } = require('../models');
        
        const client = await sequelize.query(
            'SELECT id, business_name, business_phone, ringlypro_number, rachel_enabled FROM clients WHERE id = :client_id',
            { 
                replacements: { client_id: client_id },
                type: sequelize.QueryTypes.SELECT 
            }
        );

        if (!client || client.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        const config = CARRIER_CODES[carrier];
        const rachelNumber = client[0].ringlypro_number;
        
        // Generate activation codes
        const activationCodes = {};
        Object.keys(config.conditional).forEach(type => {
            if (type !== 'note') {
                activationCodes[type] = config.conditional[type].replace('{rachel_number}', rachelNumber);
            }
        });
        
        // Generate deactivation codes
        const deactivationCodes = config.deactivate;
        
        // Get recommended setup
        const recommendedType = config.recommended;
        const recommendedCode = activationCodes[recommendedType];
        const recommendedDeactivate = deactivationCodes[recommendedType] || deactivationCodes.all;

        res.json({
            success: true,
            carrier: {
                name: config.name,
                description: config.description
            },
            client: client[0],
            setup: {
                recommended: {
                    type: recommendedType,
                    activate: recommendedCode,
                    deactivate: recommendedDeactivate,
                    instructions: {
                        activate: `From ${client[0].business_phone}, dial: ${recommendedCode}`,
                        deactivate: `From ${client[0].business_phone}, dial: ${recommendedDeactivate}`
                    }
                },
                all_options: {
                    activation_codes: activationCodes,
                    deactivation_codes: deactivationCodes
                }
            },
            usage_notes: [
                "Dial these codes from your business phone line",
                "You'll hear a confirmation tone when successfully activated",
                "ALL calls will forward IMMEDIATELY to Rachel AI",
                "Test by calling your business number - it will forward right away",
                "Use deactivation code anytime to turn off forwarding"
            ]
        });

    } catch (error) {
        console.error('Call forwarding setup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate forwarding setup',
            details: error.message
        });
    }
});

module.exports = router;